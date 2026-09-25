/**
 * Terrain spike for the quadruped (exploratory, dev seeds), with the published network unchanged: does
 * System One, trained on flat ground only, still walk on hills and branches, and does its ensemble become
 * less confident there, so that the hybrid escalates more? Protocol, calibration rule and the rule for
 * retraining are fixed in openspec/changes/add-quadruped-terrain/design.md.
 */
import { availableParallelism } from 'node:os';
import type { EpisodeRecord } from '../src/eval/runner';
import { mean } from '../src/core/stats';
import { DEFAULT_TERRAIN, type TerrainConfig } from '../src/games/quadruped';
import { auroc, type ExperimentResult } from './common';
import { Pool } from './workers/pool';
import type { TerrainTask } from './workers/quadruped-terrain-worker';

const MODEL_DIR = 'artifacts/quadruped/study/run-1';

const SMOKE = process.env.QUAD_SMOKE === '1';
const SEEDS = Array.from({ length: SMOKE ? 3 : 40 }, (_, i) => 10001 + i);
const PLANNER = 'system2 (level 2)';
const CONDITIONS = ['base controller', PLANNER, 'system1', 'guard only', 'hybrid ensemble@0.9', 'hybrid+guard ensemble@0.7', 'hybrid+guard ensemble@0.9'];
const SLOPES = [4, 8, 12, 16];
const DENSITIES = [0.3, 0.6, 1.0];
/** Calibration: the hardest level at which the planner falls on at most this share of the seeds. */
const MAX_PLANNER_FALLS = 0.2;
/** Retraining rule: System One alone below this share of the planner's distance on some viable terrain. */
const RETRAIN_BELOW = 0.9;

type Terrain = Partial<TerrainConfig>;

async function play(pool: Pool<TerrainTask>, condition: string, terrain: Terrain): Promise<EpisodeRecord[]> {
  const replies = await Promise.all(SEEDS.map((seed) => pool.run({ condition, seed, terrain, modelDir: MODEL_DIR })));
  return replies.map((r) => r.record as EpisodeRecord);
}

function summary(rs: EpisodeRecord[]) {
  const moves = rs.reduce((a, r) => a + r.moves, 0);
  const confidences = rs.flatMap((r) => r.confidences);
  const correct = rs.flatMap((r) => r.correct);
  const wrong = correct.map((c) => !c);
  return {
    distance: mean(rs.map((r) => r.score)),
    falls: rs.filter((r) => r.endReason === 'fall').length,
    costPerMove: rs.reduce((a, r) => a + r.cost, 0) / moves,
    escalation: rs.reduce((a, r) => a + r.escalated, 0) / moves,
    meanConfidence: confidences.length ? mean(confidences) : null,
    agreement: correct.length ? correct.filter(Boolean).length / correct.length : null,
    auroc: wrong.some(Boolean) && wrong.some((w) => !w) ? auroc(confidences.map((c) => 1 - c), wrong) : null,
    msPerMove: rs.reduce((a, r) => a + r.timeMs, 0) / moves,
  };
}

export async function run(): Promise<ExperimentResult> {
  const pool = new Pool<TerrainTask>(new URL('./workers/quadruped-terrain-worker.ts', import.meta.url), Math.max(1, availableParallelism() - 2));
  try {
    // 1. Calibration on the planner, per terrain family.
    const calibrate = async (label: string, levels: number[], terrainOf: (v: number) => Terrain) => {
      const played = await Promise.all(levels.map((v) => play(pool, PLANNER, terrainOf(v))));
      const rows = levels.map((level, i) => ({
        level,
        plannerFalls: played[i].filter((r) => r.endReason === 'fall').length,
        plannerDistance: mean(played[i].map((r) => r.score)),
      }));
      for (const r of rows) console.log(`calibration ${label} ${r.level}: planner falls ${r.plannerFalls}/${SEEDS.length}, ${r.plannerDistance.toFixed(2)} m`);
      const ok = rows.filter((r) => r.plannerFalls / SEEDS.length <= MAX_PLANNER_FALLS);
      return { rows, chosen: ok.length ? ok.at(-1)!.level : levels[0], anyQualified: ok.length > 0 };
    };
    const [slope, density] = await Promise.all([
      calibrate('hills maxSlopeDeg', SLOPES, (v) => ({ kind: 'hills', maxSlopeDeg: v })),
      calibrate('branches per metre', DENSITIES, (v) => ({ kind: 'branches', branchDensity: v })),
    ]);

    // 2. Every condition on every terrain.
    const terrains: Record<string, Terrain> = {
      flat: { kind: 'flat' },
      hills: { kind: 'hills', maxSlopeDeg: slope.chosen },
      branches: { kind: 'branches', branchDensity: density.chosen },
      mixed: { kind: 'mixed', maxSlopeDeg: slope.chosen, branchDensity: density.chosen },
    };
    const results: Record<string, Record<string, ReturnType<typeof summary>>> = {};
    const jobs = Object.entries(terrains).flatMap(([name, terrain]) => CONDITIONS.map((condition) => ({ name, terrain, condition })));
    const played = await Promise.all(jobs.map((j) => play(pool, j.condition, j.terrain)));
    jobs.forEach((j, i) => {
      const s = summary(played[i]);
      (results[j.name] ??= {})[j.condition] = s;
      console.log(`${j.name.padEnd(9)} ${j.condition.padEnd(26)} ${s.distance.toFixed(2)} m, falls ${s.falls}, escalation ${(100 * s.escalation).toFixed(1)}%, confidence ${s.meanConfidence?.toFixed(3) ?? '-'}`);
    });

    // 3. The retraining rule.
    const viable = Object.keys(terrains).filter((t) => t !== 'flat' && results[t][PLANNER].falls / SEEDS.length <= MAX_PLANNER_FALLS);
    const ratios = Object.fromEntries(viable.map((t) => [t, results[t].system1.distance / results[t][PLANNER].distance]));
    const retrain = viable.some((t) => ratios[t] < RETRAIN_BELOW);

    return {
      claim:
        'Exploratory: how the quadruped System One trained on flat ground transfers to seeded hills and branches, and whether its ensemble confidence falls there.',
      split: 'dev',
      seeds: SEEDS,
      config: { model: MODEL_DIR, pushImpulse: 8, slopes: SLOPES, densities: DENSITIES, maxPlannerFalls: MAX_PLANNER_FALLS, retrainBelow: RETRAIN_BELOW, terrainDefaults: DEFAULT_TERRAIN, smoke: SMOKE },
      results: { calibration: { slope, density }, terrains, results, system1OverPlanner: ratios, retrain },
    };
  } finally {
    await pool.close();
  }
}
