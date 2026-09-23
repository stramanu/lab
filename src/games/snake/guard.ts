import type { Guard, GuardResult } from '../../core/types';
import type { SnakeEnv } from './env';
import { tailReachable, type CostCounter } from './search';

/**
 * Safety check on the move proposed by System One: reject it if the snake dies
 * on that step or if the tail is no longer reachable afterwards. It is a
 * fragment of the planner run on a single action.
 * Cost = 1 (simulated step) + cells expanded by the early-exit tail search.
 */
export class SnakeGuard implements Guard {
  readonly name = 'snake-tail-guard';

  check(env: SnakeEnv, action: number): GuardResult {
    const sim = env.clone();
    sim.step(action);
    if (sim.endReason === 'win') return { ok: true, cost: 1 };
    if (sim.endReason) return { ok: false, cost: 1 };
    const counter: CostCounter = { nodes: 0 };
    const ok = tailReachable(sim, counter);
    return { ok, cost: 1 + counter.nodes };
  }
}
