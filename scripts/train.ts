/**
 * Offline training in Node for any registered game.
 * Usage: pnpm tsx scripts/train.ts --game snake|lander [--out artifacts/<game>] [--seed 1] [--iterations 30]
 *        [--tau T] [--threshold 0.9] [--audit 0.02] [--retrain-every 2000] [--bootstrap-episodes K]
 *        [--level L] [--confidence maxProb|margin] [--capacity 100000] [--no-guard]
 * Package aliases: pnpm train:snake, pnpm train:lander.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGame } from '../src/games/registry';
import type { ConfidenceMeasure } from '../src/hybrid';
import { TrainingPipeline, type LogEntry, type PipelineConfig } from '../src/training';
import { num, parseArgs } from './cli';

const args = parseArgs(process.argv.slice(2));
const game = getGame(args.game ?? 'snake');
const outDir = args.out ?? `artifacts/${game.name}`;
const level = num(args, 'level') ?? num(args, 'depth') ?? game.referenceLevel;

const overrides: Partial<PipelineConfig> = { ...game.pipeline };
const map: Array<[string, keyof PipelineConfig]> = [
  ['seed', 'seed'],
  ['iterations', 'iterations'],
  ['tau', 'tau'],
  ['threshold', 'threshold'],
  ['audit', 'auditRate'],
  ['retrain-every', 'retrainEvery'],
  ['retrain-epochs', 'retrainEpochs'],
  ['bootstrap-episodes', 'bootstrapEpisodes'],
  ['bootstrap-epochs', 'bootstrapEpochs'],
  ['consolidation-epochs', 'consolidationEpochs'],
  ['capacity', 'datasetCapacity'],
  ['lr', 'lr'],
];
for (const [flag, key] of map) {
  const v = num(args, flag);
  if (v !== undefined) (overrides as Record<string, number>)[key] = v;
}
if (args.confidence) overrides.confidence = args.confidence as ConfidenceMeasure;
if (args['no-guard']) overrides.useGuard = false;

mkdirSync(outDir, { recursive: true });
const logPath = join(outDir, 'train-log.jsonl');
writeFileSync(logPath, '');

const fmt = (v: number | null, d = 3) => (v === null || Number.isNaN(v) ? '   -  ' : v.toFixed(d));
const onLog = (e: LogEntry) => {
  appendFileSync(logPath, JSON.stringify(e) + '\n');
  console.log(
    `[${e.phase.padEnd(13)}] it=${String(e.iteration).padStart(3)} loss=${fmt(e.loss)} valLoss=${fmt(e.valLoss)} ` +
      `valAgree=${fmt(e.valAgreement)} esc=${fmt(e.escalationRate)} guard=${fmt(e.guardEscalationRate)} audit=${fmt(e.auditAgreement)} ` +
      `score=${fmt(e.meanScore, 1)} eps=${e.episodes} moves=${e.moves} data=${e.datasetSize}/${e.validationSize} ` +
      `T=${e.calibrationT.toFixed(2)} t=${(e.elapsedMs / 1000).toFixed(1)}s`,
  );
};

const pipeline = new TrainingPipeline(
  { name: game.name, makeEnv: game.makeEnv, teacher: game.makeTeacher(level), guard: game.makeGuard() },
  overrides,
  onLog,
);
const t0 = performance.now();
const policy = pipeline.run({ teacherLevel: level });
const seconds = (performance.now() - t0) / 1000;
policy.meta = { ...policy.meta, trainingSeconds: Number(seconds.toFixed(1)) };

const json = JSON.stringify(policy);
writeFileSync(join(outDir, 'weights.json'), json);
console.log(
  `\nDone in ${seconds.toFixed(1)}s — ${pipeline.net.numParams} params, ${(json.length / 1024).toFixed(1)} KB, ` +
    `T=${policy.calibrationT.toFixed(2)} → ${join(outDir, 'weights.json')}`,
);
