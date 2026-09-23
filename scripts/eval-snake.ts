/**
 * Evaluates trained Snake weights on the fixed evaluation seeds.
 * Usage: pnpm eval:snake [--dir artifacts/snake] [--seeds 200] [--levels 0,1,2] [--measures maxProb,margin] [--no-guard]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import { checkHypotheses, evalSeeds, formatReport, runCondition, standardConditions, type EvalReport } from '../src/eval';
import { SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';
import type { ConfidenceMeasure } from '../src/hybrid';
import { importPolicy, type SerializedPolicy } from '../src/nn';
import type { LogEntry } from '../src/training';
import { num, parseArgs } from './cli';

const args = parseArgs(process.argv.slice(2));
const dir = args.dir ?? 'artifacts/snake';
const weightsPath = join(dir, 'weights.json');
if (!existsSync(weightsPath)) {
  console.error(`No weights at ${weightsPath}. Run \`pnpm train:snake\` first.`);
  process.exit(1);
}
const raw = readFileSync(weightsPath, 'utf8');
const policy = JSON.parse(raw) as SerializedPolicy;
const { net, calibrationT, meta } = importPolicy(policy);

const teacherName = String(meta?.teacher ?? 'snake-planner-d1');
const referenceLevel = num(args, 'depth') ?? Number(/d(\d+)$/.exec(teacherName)?.[1] ?? 1);
const levels = (args.levels ?? '0,1,2').split(',').map(Number);
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
  makeTeacher: (depth) => new SnakeTeacher({ depth }),
  levels,
  referenceLevel,
  net,
  temperature: calibrationT,
  measures,
  guard: args['no-guard'] ? undefined : new SnakeGuard(),
});
const oracle = new SnakeTeacher({ depth: referenceLevel });

const results = conditions.map((c) => {
  const t0 = performance.now();
  const r = runCondition(c, { makeEnv: () => new SnakeEnv(), seeds, oracle });
  console.log(`${c.name.padEnd(28)} score=${r.score.mean.toFixed(1)} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  return r;
});

const cpu = cpus();
const report: EvalReport = {
  game: 'snake',
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
