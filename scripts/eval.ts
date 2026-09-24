/**
 * Evaluates trained weights of any registered game on a seed split (dev by default).
 * Usage: pnpm eval --game <snake|lander|warehouse|racing|quadruped> [--split dev|test] [--dir artifacts/<game>] [--seeds N]
 *        [--levels a,b,c] [--measures maxProb,margin] [--no-guard] [--workers N]
 * Package aliases: pnpm eval:snake, pnpm eval:lander.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkHypotheses, formatReport, parseSplit, seedsFor, type EvalReport } from '../src/eval';
import { getGame } from '../src/games/registry';
import type { ConfidenceMeasure } from '../src/hybrid';
import { num, parseArgs } from './cli';
import { defaultWorkers, EvalPool } from './eval-pool';
import { gameConditions, hardware, loadModel, runConditions, trainingEscalation } from './lib';

const args = parseArgs(process.argv.slice(2));
const game = getGame(args.game ?? 'snake');
await game.init?.();
const dir = args.dir ?? `artifacts/${game.name}`;
const model = loadModel(dir);
if (!model) {
  console.error(`No weights in ${dir}. Run \`pnpm train:${game.name}\` first.`);
  process.exit(1);
}
const { meta } = model;
const referenceLevel = num(args, 'level') ?? (typeof meta?.teacherLevel === 'number' ? meta.teacherLevel : game.referenceLevel);
const measures = (args.measures ?? 'maxProb,margin').split(',') as ConfidenceMeasure[];
const split = parseSplit(args.split);
if (split === 'test') console.log('Evaluating on the TEST split: use it only for final, published numbers.\n');
const seeds = seedsFor(split, num(args, 'seeds'));

const options = {
  levels: args.levels ? args.levels.split(',').map(Number) : game.levels,
  referenceLevel,
  measures,
  guard: !args['no-guard'],
};
const conditions = gameConditions(game, model, options);
const workers = num(args, 'workers') ?? defaultWorkers();
const pool = workers > 1 ? new EvalPool(workers) : null;
const results = await runConditions(game, conditions, seeds, referenceLevel, false, pool ? { pool, modelDir: dir, options } : undefined);
await pool?.close();

const report: EvalReport = {
  game: game.name,
  createdAt: new Date().toISOString(),
  split,
  seeds: { count: seeds.length, first: seeds[0], last: seeds[seeds.length - 1] },
  model: {
    params: model.params,
    weightsKB: Number((model.raw.length / 1024).toFixed(1)),
    calibrationT: model.calibrationT,
    trainingSeconds: typeof meta?.trainingSeconds === 'number' ? meta.trainingSeconds : null,
  },
  hardware: hardware(),
  conditions: results,
  hypotheses: checkHypotheses({ conditions: results, trainingEscalation: trainingEscalation(dir), referenceLevel, measure: game.continuous ? 'ensemble' : measures[0] }),
};

const out = join(dir, `eval-report-${split}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log('\n' + formatReport(report));
console.log(`\nReport → ${out}`);
