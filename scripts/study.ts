/**
 * Multi-seed study: trains N runs with different training seeds, evaluates
 * them on one split and aggregates results across runs (mean, 95% t-interval,
 * per-run hypothesis tally). Resumable: finished runs and evaluations are reused.
 * Usage: pnpm study --game snake|lander [--runs 5] [--split dev|test] [--seeds N] [--measures maxProb,margin]
 *        [--iterations K]  (fewer escalation iterations: smoke tests only, never for reported results)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRAIN_SEED_START, aggregateRuns, parseSplit, seedsFor, type Aggregate, type ConditionResult } from '../src/eval';
import { getGame } from '../src/games/registry';
import type { ConfidenceMeasure } from '../src/hybrid';
import { num, parseArgs } from './cli';
import { gameConditions, hardware, isWeightIndependent, loadModel, runConditions, trainGame, trainingEscalation } from './lib';

const args = parseArgs(process.argv.slice(2));
const game = getGame(args.game ?? 'snake');
const runs = num(args, 'runs') ?? 5;
const split = parseSplit(args.split);
const seeds = seedsFor(split, num(args, 'seeds'));
const measures = (args.measures ?? 'maxProb,margin').split(',') as ConfidenceMeasure[];
const root = args.dir ?? `artifacts/${game.name}/study`;
const iterations = num(args, 'iterations');
const tag = `${split}-${seeds.length}`;
if (split === 'test') console.log('Study on the TEST split: use it only for final, published numbers.\n');
mkdirSync(root, { recursive: true });

const conditionOptions = { levels: game.levels, referenceLevel: game.referenceLevel, measures, guard: true };
const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null);

// 1. Train every run (skipped when its weights already exist).
for (let k = 1; k <= runs; k++) {
  const dir = join(root, `run-${k}`);
  if (loadModel(dir)) continue;
  console.log(`Training run ${k}/${runs}…`);
  const { seconds } = trainGame(
    game,
    { seed: k, trainSeedStart: TRAIN_SEED_START + (k - 1) * 100_000, ...(iterations !== undefined ? { iterations } : {}) },
    dir,
    game.referenceLevel,
    true,
  );
  console.log(`  done in ${seconds.toFixed(1)}s`);
}

// 2. Weight-independent conditions: evaluated once, shared by every run.
const firstModel = loadModel(join(root, 'run-1'))!;
const allConditions = gameConditions(game, firstModel, conditionOptions);
const order = allConditions.map((c) => c.name);
const sharedPath = join(root, `shared-${tag}.json`);
let shared = readJson<ConditionResult[]>(sharedPath);
if (!shared) {
  console.log('Evaluating weight-independent conditions…');
  shared = runConditions(game, allConditions.filter(isWeightIndependent), seeds, game.referenceLevel);
  writeFileSync(sharedPath, JSON.stringify(shared));
}

// 3. Weight-dependent conditions, per run.
const perRun = [];
for (let k = 1; k <= runs; k++) {
  const dir = join(root, `run-${k}`);
  const path = join(dir, `eval-${tag}.json`);
  let own = readJson<ConditionResult[]>(path);
  if (!own) {
    console.log(`Evaluating run ${k}/${runs}…`);
    const model = loadModel(dir)!;
    own = runConditions(game, gameConditions(game, model, conditionOptions).filter((c) => !isWeightIndependent(c)), seeds, game.referenceLevel, true);
    writeFileSync(path, JSON.stringify(own));
  }
  const byName = new Map([...shared, ...own].map((c) => [c.name, c]));
  perRun.push({ conditions: order.map((n) => byName.get(n)!), trainingEscalation: trainingEscalation(dir) });
}

// 4. Aggregate.
const aggregate: Aggregate = aggregateRuns(perRun, { referenceLevel: game.referenceLevel, measure: measures[0] }, new Set(shared.map((c) => c.name)));
const out = {
  game: game.name,
  createdAt: new Date().toISOString(),
  split,
  seeds: { count: seeds.length, first: seeds[0], last: seeds[seeds.length - 1] },
  model: { params: firstModel.net.numParams, weightsKB: Number((firstModel.raw.length / 1024).toFixed(1)) },
  trainingSeconds: Array.from({ length: runs }, (_, i) => loadModel(join(root, `run-${i + 1}`))!.meta?.trainingSeconds ?? null),
  hardware: hardware(),
  ...aggregate,
};
const outPath = join(root, `study-${tag}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2));

const iv = (m: number, c: number, d = 1) => `${m.toFixed(d)} ± ${c.toFixed(d)}`;
console.log(`\n${game.name} — ${runs} runs × ${seeds.length} ${split} seeds (mean ± 95% t-interval across runs)\n`);
console.log(`${'condition'.padEnd(28)} ${'score'.padStart(16)} ${'cost/move'.padStart(18)} ${'escalated'.padStart(16)} ${'agree'.padStart(16)}`);
for (const c of aggregate.conditions) {
  const pct = (x: typeof c.escalationRate) => (x ? `${(x.mean * 100).toFixed(1)}% ± ${(x.ci95 * 100).toFixed(1)}` : '-');
  console.log(
    `${(c.name + (c.shared ? ' *' : '')).padEnd(28)} ${iv(c.score.mean, c.score.ci95).padStart(16)} ${iv(c.costPerMove.mean, c.costPerMove.ci95).padStart(18)} ` +
      `${pct(c.escalationRate).padStart(16)} ${pct(c.agreementAboveThreshold).padStart(16)}`,
  );
}
console.log('* shared: independent of the trained weights, evaluated once.\n');
for (const h of aggregate.hypotheses) console.log(`${h.id} ${h.confirmed ? 'CONFIRMED    ' : 'NOT CONFIRMED'} ${h.measured} (target: ${h.target}; holds in ${h.runsConfirmed} runs)`);
console.log(`\nStudy → ${outPath}`);
