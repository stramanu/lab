/**
 * Evaluates trained weights of any registered game on the fixed evaluation seeds.
 * Usage: pnpm tsx scripts/eval.ts --game snake|lander [--dir artifacts/<game>] [--seeds 200] [--levels a,b,c]
 *        [--measures maxProb,margin] [--no-guard]
 * Package aliases: pnpm eval:snake, pnpm eval:lander.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import { checkHypotheses, evalSeeds, formatReport, runCondition, standardConditions, type EvalReport } from '../src/eval';
import { getGame } from '../src/games/registry';
import type { ConfidenceMeasure } from '../src/hybrid';
import { importPolicy, type SerializedPolicy } from '../src/nn';
import type { LogEntry } from '../src/training';
import { num, parseArgs } from './cli';

const args = parseArgs(process.argv.slice(2));
const game = getGame(args.game ?? 'snake');
const dir = args.dir ?? `artifacts/${game.name}`;
const weightsPath = join(dir, 'weights.json');
if (!existsSync(weightsPath)) {
  console.error(`No weights at ${weightsPath}. Run \`pnpm train:${game.name}\` first.`);
  process.exit(1);
}
const raw = readFileSync(weightsPath, 'utf8');
const policy = JSON.parse(raw) as SerializedPolicy;
const { net, calibrationT, meta } = importPolicy(policy);

const referenceLevel = num(args, 'level') ?? (typeof meta?.teacherLevel === 'number' ? meta.teacherLevel : game.referenceLevel);
const levels = args.levels ? args.levels.split(',').map(Number) : game.levels;
const measures = (args.measures ?? 'maxProb,margin').split(',') as ConfidenceMeasure[];
const seeds = evalSeeds().slice(0, num(args, 'seeds') ?? 200);

const logPath = join(dir, 'train-log.jsonl');
const trainingEscalation = existsSync(logPath)
  ? readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LogEntry)
      .filter((e) => e.phase === 'escalation')
      .map((e) => e.escalationRate)
  : undefined;

const conditions = standardConditions({
  makeTeacher: game.makeTeacher,
  levels,
  referenceLevel,
  net,
  temperature: calibrationT,
  measures,
  guard: args['no-guard'] ? undefined : game.makeGuard(),
});
for (const b of game.baselines) conditions.push({ name: b.name, kind: 'baseline', params: {}, makePlayer: b.makePlayer });
const oracle = game.makeTeacher(referenceLevel);

const results = conditions.map((c) => {
  const t0 = performance.now();
  const r = runCondition(c, { makeEnv: game.makeEnv, seeds, oracle });
  console.log(`${c.name.padEnd(28)} score=${r.score.mean.toFixed(1)} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  return r;
});

const cpu = cpus();
const report: EvalReport = {
  game: game.name,
  createdAt: new Date().toISOString(),
  seeds: { count: seeds.length, first: seeds[0], last: seeds[seeds.length - 1] },
  model: {
    params: net.numParams,
    weightsKB: Number((raw.length / 1024).toFixed(1)),
    calibrationT,
    trainingSeconds: typeof meta?.trainingSeconds === 'number' ? meta.trainingSeconds : null,
  },
  hardware: {
    cpu: cpu[0]?.model ?? 'unknown',
    cores: cpu.length,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    platform: `${platform()}-${arch()}`,
    node: process.version,
  },
  conditions: results,
  hypotheses: checkHypotheses({ conditions: results, trainingEscalation, referenceLevel, measure: measures[0] }),
};

writeFileSync(join(dir, 'eval-report.json'), JSON.stringify(report, null, 2));
console.log('\n' + formatReport(report));
console.log(`\nReport → ${join(dir, 'eval-report.json')}`);
