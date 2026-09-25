/// <reference lib="webworker" />
/**
 * Evaluates a share of the quadruped planner's candidates off the main thread. The page splits the 21
 * candidates across a few of these workers and combines their raw values (QuadrupedTeacher.combine), so
 * System Two answers several times faster, with exactly the answer it would give in place: the physics
 * snapshot restores the live state exactly, and the candidates are independent.
 */
import { DEFAULT_GAIT, initQuadrupedPhysics, QuadrupedEnv, QuadrupedTeacher, type GaitConfig, type QuadrupedConfig, type QuadrupedSnapshot, type RobotHandles } from '../src/games/quadruped';

export interface PlanRequest {
  id: number;
  snapshot: QuadrupedSnapshot;
  handles: RobotHandles;
  config: QuadrupedConfig;
  gait: GaitConfig;
  horizon: number;
  /** Indices of the candidates this worker evaluates. */
  candidates: number[];
}

export type PlanResponse = { id: number; values: Array<[number, number]>; cost: number } | { id: number; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const ready = initQuadrupedPhysics();

ctx.onmessage = async (e: MessageEvent<PlanRequest>) => {
  const { id, snapshot, handles, config, gait, horizon, candidates } = e.data;
  try {
    await ready;
    const env = QuadrupedEnv.fromSnapshot(snapshot, handles, config, { ...DEFAULT_GAIT, ...gait });
    const teacher = new QuadrupedTeacher({ horizon });
    const values: Array<[number, number]> = [];
    let cost = 0;
    for (const a of candidates) {
      const r = teacher.candidateValue(env, snapshot, env.score(), a);
      values.push([a, r.value]);
      cost += r.cost;
    }
    env.dispose();
    ctx.postMessage({ id, values, cost } satisfies PlanResponse);
  } catch (err) {
    ctx.postMessage({ id, error: String(err) } satisfies PlanResponse);
  }
};
