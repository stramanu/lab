import type { Env, MoveRecord } from '../src/core/types';
import type { QuadrupedEnv, QuadrupedTeacher } from '../src/games/quadruped';
import type { ContinuousHybridPlayer, Escalation } from '../src/hybrid';
import type { PlanRequest, PlanResponse } from './quadruped-planner-worker';

/**
 * Runs the quadruped's planner (~0.2 s per decision) in a worker, so the page keeps animating.
 * One request at a time; answers for a state that is gone (new episode, new game) are dropped.
 */
export class PlannerWorkerClient {
  private worker: Worker | null = null;
  private pending: { id: number; escalation: Escalation; env: Env; hybrid: ContinuousHybridPlayer; done: (m: MoveRecord) => void } | null = null;
  private nextId = 0;

  get busy(): boolean {
    return this.pending !== null;
  }

  cancel(): void {
    this.pending = null;
  }

  request(env: QuadrupedEnv, hybrid: ContinuousHybridPlayer, escalation: Escalation, done: (m: MoveRecord) => void): void {
    if (!this.worker) {
      this.worker = new Worker(new URL('./quadruped-planner-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (msg: MessageEvent<PlanResponse>) => {
        const p = this.pending;
        if (!p || msg.data.id !== p.id) return;
        this.pending = null;
        // On a worker error, the planner runs in place (slower, same answer).
        p.done('error' in msg.data ? p.hybrid.resolve(p.escalation, p.hybrid.teacher.targetAction(p.env)) : p.hybrid.resolve(p.escalation, msg.data));
      };
    }
    const id = ++this.nextId;
    this.pending = { id, escalation, env, hybrid, done };
    const horizon = (hybrid.teacher as QuadrupedTeacher).config.horizon;
    this.worker.postMessage({ id, snapshot: env.snapshot(), handles: env.handles!, config: env.config, gait: env.gait, horizon } satisfies PlanRequest);
  }
}
