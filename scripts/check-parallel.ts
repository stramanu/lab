/**
 * Checks that parallel evaluation reproduces the sequential one exactly (wall-clock timings excepted).
 * Usage: pnpm tsx scripts/check-parallel.ts <game> [seeds=6] [workers=4]
 * Snake uses the published weights; continuous games use a freshly initialised ensemble (any fixed
 * weights will do: the check is about evaluation, not quality). Only inexpensive conditions are run:
 * for continuous games, conditions with a student label every System One decision with the reference
 * planner, so the check uses the baselines and the lowest planner level.
 */
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedsFor } from '../src/eval';
import { getGame } from '../src/games/registry';
import { Ensemble, exportEnsemble } from '../src/nn';
import { EvalPool } from './eval-pool';
import { gameConditions, loadModel, runConditions, type ConditionOptions } from './lib';

const [name = 'snake', seedArg = '6', workerArg = '4'] = process.argv.slice(2);
const game = getGame(name);
await game.init?.();
const dir = mkdtempSync(join(tmpdir(), `check-parallel-${name}-`));
mkdirSync(dir, { recursive: true });
if (game.continuous) {
  const probe = game.continuous.makeEnv();
  const ensemble = new Ensemble({ inputSize: probe.encodingSize, hidden: [64, 64], members: 5, seed: 1, low: [...probe.actionLow], high: [...probe.actionHigh] });
  writeFileSync(join(dir, 'weights.json'), JSON.stringify(exportEnsemble(ensemble)));
} else {
  copyFileSync(`web/public/data/${name}-weights.json`, join(dir, 'weights.json'));
}
const options: ConditionOptions = { levels: [game.levels[0]], referenceLevel: game.referenceLevel, measures: ['maxProb'], guard: true };
const all = gameConditions(game, loadModel(dir)!, options);
// Cheap conditions only: System One, the lowest planner level (discrete games), one guarded hybrid, the baselines.
const conditions = game.continuous
  ? all.filter((c) => c.kind === 'random' || c.kind === 'baseline' || c.kind === 'system2')
  : all.filter((c) => c.kind === 'random' || c.kind === 'system1' || c.kind === 'baseline' || c.kind === 'system2' || c.name.startsWith('guard only'));
const seeds = seedsFor('dev', Number(seedArg));
const strip = (rs: object[]) => JSON.stringify(rs, (k, v) => (k === 'usPerMove' ? undefined : v));
const sequential = await runConditions(game, conditions, seeds, game.referenceLevel, true);
const pool = new EvalPool(Number(workerArg));
const parallel = await runConditions(game, conditions, seeds, game.referenceLevel, true, { pool, modelDir: dir, options });
await pool.close();
const same = strip(sequential) === strip(parallel);
console.log(`${name}: ${conditions.map((c) => c.name).join(', ')} on ${seeds.length} dev seeds with ${workerArg} workers → ${same ? 'IDENTICAL' : 'DIFFERENT'}`);
process.exit(same ? 0 : 1);
