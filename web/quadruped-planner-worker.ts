/// <reference lib="webworker" />
/**
 * Runs the quadruped's planner off the main thread (about 0.2 s per decision), so the page keeps
 * animating while System Two thinks. It receives a physics snapshot of the live state and returns
 * the same answer the planner would give in place: the snapshot restores the state exactly.
 */
import { DEFAULT_GAIT, initQuadrupedPhysics, QuadrupedEnv, QuadrupedTeacher, type GaitConfig, type QuadrupedConfig, type QuadrupedSnapshot, type RobotHandles } from '../src/games/quadruped';

export interface PlanRequest {
  id: number;
  snapshot: QuadrupedSnapshot;
  handles: RobotHandles;
  config: QuadrupedConfig;
  gait: GaitConfig;
  horizon: number;
}

export type PlanResponse = { id: number; action: Float64Array; scores: Float64Array; cost: number } | { id: number; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const ready = initQuadrupedPhysics();

ctx.onmessage = async (e: MessageEvent<PlanRequest>) => {
  const { id, snapshot, handles, config, gait, horizon } = e.data;
  try {
    await ready;
    const env = QuadrupedEnv.fromSnapshot(snapshot, handles, config, { ...DEFAULT_GAIT, ...gait });
    const t = new QuadrupedTeacher({ horizon }).targetAction(env);
    env.dispose();
    ctx.postMessage({ id, action: t.action, scores: t.scores, cost: t.cost } satisfies PlanResponse);
  } catch (err) {
    ctx.postMessage({ id, error: String(err) } satisfies PlanResponse);
  }
};
