/**
 * Spike v2 rule for the planner's satisficing margin (design.md, "Revision after spike v1"):
 * the standard deviation of the base controller's progress over 1 s windows, without pushes, on
 * dev seeds 10001–10020, after the speed ramp (t ≥ 2 s). Candidates that differ by less than the
 * gait's own variability are treated as equivalent. Measured without the planner or the criteria.
 */
import { mean, std } from '../src/core/stats';
import { seedsFor } from '../src/eval';
import { initQuadrupedPhysics, QuadrupedEnv } from '../src/games/quadruped';
import type { ExperimentResult } from './common';

export async function run(): Promise<ExperimentResult> {
  await initQuadrupedPhysics();
  const seeds = seedsFor('dev', 20);
  const windows: number[] = [];
  for (const seed of seeds) {
    const env = new QuadrupedEnv({ pushImpulse: 0 });
    env.reset(seed);
    let start = NaN;
    while (!env.isDone()) {
      env.advance([0, 0, 0, 0]);
      if (env.time < 2 - 1e-9) continue;
      if (env.decisions % 10 === 0) {
        if (!Number.isNaN(start)) windows.push(env.score() - start);
        start = env.score();
      }
    }
    env.dispose();
  }
  return {
    claim: "The quadruped planner's satisficing margin is the base gait's own variability over 1 s.",
    split: 'dev',
    seeds,
    config: { pushImpulse: 0, window: '1 s (10 decisions)', from: '2 s' },
    results: { windows: windows.length, meanProgress: mean(windows), stdProgress: std(windows), margin: std(windows) },
  };
}
