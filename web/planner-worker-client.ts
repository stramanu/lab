import type { Env, MoveRecord } from '../src/core/types';
import { CANDIDATES, type QuadrupedEnv, type QuadrupedTeacher } from '../src/games/quadruped';
import type { ContinuousHybridPlayer, Escalation } from '../src/hybrid';
import type { PlanRequest, PlanResponse } from './quadruped-planner-worker';

/** Planner workers: up to 4, leaving a core for the page. */
const WORKERS = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

/**
 * Runs the quadruped's planner off the main thread, its 21 candidates split across a few workers, so the
 * page keeps animating and System Two answers several times faster than on one thread. One request at a
 * time; answers for a state that is gone (new episode, new game) are dropped.
 */
export class PlannerWorkerClient {
  private workers: Worker[] = [];
  private pending: {
    id: number;
    escalation: Escalation;
    env: Env;
    hybrid: ContinuousHybridPlayer;
    done: (m: MoveRecord) => void;
    values: Float64Array;
    cost: number;
    waiting: number;
    failed: boolean;
  } | null = null;
  private nextId = 0;

  get busy(): boolean {
    return this.pending !== null;
  }

  cancel(): void {
    this.pending = null;
  }

  private onMessage(msg: MessageEvent<PlanResponse>): void {
    const p = this.pending;
    if (!p || msg.data.id !== p.id) return;
    if ('error' in msg.data) p.failed = true;
    else {
      for (const [a, v] of msg.data.values) p.values[a] = v;
      p.cost += msg.data.cost;
    }
    if (--p.waiting > 0) return;
    this.pending = null;
    const teacher = p.hybrid.teacher as QuadrupedTeacher;
    // On a worker error, the planner runs in place (slower, same answer).
    p.done(p.hybrid.resolve(p.escalation, p.failed ? teacher.targetAction(p.env as QuadrupedEnv) : teacher.choose(teacher.combine(p.values, p.cost))));
  }

  request(env: QuadrupedEnv, hybrid: ContinuousHybridPlayer, escalation: Escalation, done: (m: MoveRecord) => void): void {
    if (!this.workers.length) {
      this.workers = Array.from({ length: WORKERS }, () => {
        const w = new Worker(new URL('./quadruped-planner-worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (msg: MessageEvent<PlanResponse>) => this.onMessage(msg);
        return w;
      });
    }
    const id = ++this.nextId;
    this.pending = { id, escalation, env, hybrid, done, values: new Float64Array(CANDIDATES.length), cost: 0, waiting: this.workers.length, failed: false };
    const horizon = (hybrid.teacher as QuadrupedTeacher).config.horizon;
    const snapshot = env.snapshot();
    this.workers.forEach((w, k) => {
      // Candidates k, k + W, k + 2W, … so every worker gets a similar share.
      const candidates = CANDIDATES.map((_, a) => a).filter((a) => a % this.workers.length === k);
      w.postMessage({ id, snapshot, handles: env.handles!, config: env.config, gait: env.gait, horizon, candidates } satisfies PlanRequest);
    });
  }
}
