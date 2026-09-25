/**
 * Does the warehouse fleet grind to a halt as an episode goes on? Deliveries in the first and last quarter
 * of each episode, and episodes whose last 50 timesteps are frozen (fewer than 2 of the 16 robots move per
 * timestep on average), for the planner, the published System One (run 1 of the study), the hybrid and the
 * greedy baseline. Descriptive, on dev seeds (found after a visitor noticed gridlocks on the page).
 */
import { mean } from '../src/core/stats';
import { getGame } from '../src/games/registry';
import type { WarehouseEnv } from '../src/games/warehouse/env';
import { gameConditions, loadModel } from '../scripts/lib';
import type { ExperimentResult } from './common';

const MODEL_DIR = 'artifacts/warehouse/study/run-1';
const SEEDS = Array.from({ length: 20 }, (_, i) => 10001 + i);
const CONDITIONS = ['system2 (level 2)', 'hybrid+guard maxProb@0.7', 'system1', 'greedy'];
const TAIL = 50;
const FROZEN_BELOW = 2;

export function run(): ExperimentResult {
  const game = getGame('warehouse');
  const model = loadModel(MODEL_DIR);
  if (!model) throw new Error(`No model in ${MODEL_DIR}`);
  const conditions = gameConditions(game, model, { levels: [2], referenceLevel: 2, measures: ['maxProb'], guard: true });
  const results: Record<string, unknown> = {};
  for (const name of CONDITIONS) {
    const condition = conditions.find((c) => c.name === name);
    if (!condition) throw new Error(`Unknown condition ${name}`);
    const first: number[] = [];
    const last: number[] = [];
    const total: number[] = [];
    let frozen = 0;
    for (const seed of SEEDS) {
      const env = game.makeEnv() as WarehouseEnv;
      env.reset(seed);
      const player = condition.makePlayer();
      player.reset?.(seed);
      const delivered: number[] = [];
      const moved: number[] = [];
      let t = env.t;
      let before = 0;
      let prev = Array.from(env.pos);
      while (!env.isDone()) {
        env.step(player.act(env).action);
        if (env.t !== t) {
          t = env.t;
          delivered.push(env.deliveries - before);
          before = env.deliveries;
          const pos = Array.from(env.pos);
          moved.push(pos.filter((p, i) => p !== prev[i]).length);
          prev = pos;
        }
      }
      const q = Math.floor(delivered.length / 4);
      first.push(delivered.slice(0, q).reduce((a, b) => a + b, 0));
      last.push(delivered.slice(-q).reduce((a, b) => a + b, 0));
      total.push(env.deliveries);
      if (mean(moved.slice(-TAIL)) < FROZEN_BELOW) frozen++;
    }
    results[name] = { deliveries: mean(total), firstQuarter: mean(first), lastQuarter: mean(last), frozenAtEnd: frozen };
    console.log(`${name.padEnd(26)} ${mean(total).toFixed(1)} deliveries, first quarter ${mean(first).toFixed(1)}, last quarter ${mean(last).toFixed(1)}, frozen at end ${frozen}/${SEEDS.length}`);
  }
  return {
    claim: 'The warehouse fleet slows down and often ends in gridlock under every driver: the planner has no deadlock resolution, and System One inherits it.',
    split: 'dev',
    seeds: SEEDS,
    config: { model: MODEL_DIR, tail: TAIL, frozenBelow: FROZEN_BELOW },
    results,
  };
}
