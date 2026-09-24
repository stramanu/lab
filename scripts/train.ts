/**
 * Offline training in Node for any registered game.
 * Usage: pnpm train --game <snake|lander|warehouse|racing|quadruped> [--out artifacts/<game>] [--seed 1] [--iterations 30]
 *        [--tau T] [--threshold 0.9] [--audit 0.02] [--retrain-every 2000] [--bootstrap-episodes K]
 *        [--level L] [--confidence maxProb|margin] [--capacity 100000] [--no-guard]
 * Package aliases: pnpm train:snake, pnpm train:lander.
 */
import { join } from 'node:path';
import { getGame } from '../src/games/registry';
import type { ConfidenceMeasure } from '../src/hybrid';
import type { PipelineConfig } from '../src/training';
import { num, parseArgs } from './cli';
import { trainGame } from './lib';

const args = parseArgs(process.argv.slice(2));
const game = getGame(args.game ?? 'snake');
await game.init?.();
const outDir = args.out ?? `artifacts/${game.name}`;
const level = num(args, 'level') ?? game.referenceLevel;

const overrides: Partial<PipelineConfig> = {};
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

const { policy, seconds, numParams, json } = trainGame(game, overrides, outDir, level);
console.log(
  `\nDone in ${seconds.toFixed(1)}s — ${numParams} params, ${(json.length / 1024).toFixed(1)} KB, ` +
    `${'calibrationT' in policy ? `T=${policy.calibrationT.toFixed(2)}` : 'ensemble'} → ${join(outDir, 'weights.json')}`,
);
