/**
 * Worker thread for the quadruped terrain study: planner-driven bootstrap episodes on varied terrain,
 * one whole fine-tuning run, or one evaluation episode of a standard condition on a given terrain.
 * Deterministic per task.
 */
import { parentPort } from 'node:worker_threads';
import { runEpisode, type Condition } from '../src/eval/runner';
import { DEFAULT_TERRAIN, QuadrupedEnv, QuadrupedGuard, QuadrupedTeacher, type TerrainKind } from '../src/games/quadruped';
import { getGame, quadrupedAgrees } from '../src/games/registry';
import type { SerializedEnsemble } from '../src/nn';
import { ContinuousPipeline, plannerEpisode, type ContinuousPipelineConfig, type PlannerEpisode } from '../src/training/continuous-pipeline';
import { gameConditions, loadModel } from './lib';

export const REFERENCE_LEVEL = 2;
const HORIZON = 10; // level 2

export type TerrainTask =
  | { type: 'bootstrap'; id: number; seed: number }
  | { type: 'train'; id: number; config: ContinuousPipelineConfig; initial: SerializedEnsemble; lengths: number[]; scores: number[]; states: Float32Array; labels: Float64Array }
  | { type: 'eval'; id: number; modelDir: string; condition: string; seed: number; terrain: TerrainKind };

const makeEnv = (kind: TerrainKind) => () => new QuadrupedEnv({ terrain: { ...DEFAULT_TERRAIN, kind } });

const game = getGame('quadruped');
const ready = game.init!();
const conditions = new Map<string, Condition[]>();

parentPort!.on('message', async (task: TerrainTask) => {
  try {
    await ready;
    if (task.type === 'bootstrap') {
      const ep = plannerEpisode(makeEnv('varied'), new QuadrupedTeacher({ horizon: HORIZON }), task.seed);
      const n = ep.states.length;
      const states = new Float32Array(n * (ep.states[0]?.length ?? 0));
      const labels = new Float64Array(n * (ep.labels[0]?.length ?? 0));
      ep.states.forEach((s, i) => states.set(s, i * s.length));
      ep.labels.forEach((l, i) => labels.set(l, i * l.length));
      parentPort!.postMessage({ id: task.id, n, states, labels, score: ep.score }, [states.buffer, labels.buffer]);
    } else if (task.type === 'train') {
      const inputs = task.initial.config.inputSize;
      const dim = task.labels.length / (task.states.length / inputs);
      const episodes: PlannerEpisode[] = [];
      let offset = 0;
      task.lengths.forEach((n, e) => {
        episodes.push({
          states: Array.from({ length: n }, (_, i) => task.states.slice((offset + i) * inputs, (offset + i + 1) * inputs)),
          labels: Array.from({ length: n }, (_, i) => task.labels.slice((offset + i) * dim, (offset + i + 1) * dim)),
          score: task.scores[e],
        });
        offset += n;
      });
      const spec = { name: 'quadruped', makeEnv: makeEnv('varied'), teacher: new QuadrupedTeacher({ horizon: HORIZON }), guard: new QuadrupedGuard(), agrees: quadrupedAgrees };
      const pipeline = new ContinuousPipeline(spec, task.config, undefined, task.initial);
      const t0 = performance.now();
      const weights = pipeline.run({ terrain: 'varied', finetunedFrom: task.initial.meta ?? null }, episodes);
      parentPort!.postMessage({ id: task.id, weights, log: pipeline.log, seconds: (performance.now() - t0) / 1000 });
    } else {
      if (!conditions.has(task.modelDir)) {
        const model = loadModel(task.modelDir);
        if (!model) throw new Error(`No model in ${task.modelDir}`);
        conditions.set(task.modelDir, gameConditions(game, model, { levels: [REFERENCE_LEVEL], referenceLevel: REFERENCE_LEVEL, measures: [], guard: true }));
      }
      const condition = conditions.get(task.modelDir)!.find((c) => c.name === task.condition);
      if (!condition) throw new Error(`Unknown condition ${task.condition}`);
      const c = game.continuous!;
      const record = runEpisode(condition.makePlayer(), task.seed, {
        makeEnv: makeEnv(task.terrain),
        seeds: [task.seed],
        oracle: c.makeTeacher(REFERENCE_LEVEL),
        agrees: c.agrees,
        oracleEvery: c.oracleEvery,
      });
      parentPort!.postMessage({ id: task.id, record });
    }
  } catch (err) {
    parentPort!.postMessage({ id: task.id, error: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
});
