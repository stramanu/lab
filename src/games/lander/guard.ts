import type { Guard, GuardResult } from '../../core/types';
import type { LanderEnv } from './env';
import { copyState, emptyState, simulateDecision } from './physics';
import { pilotAction } from './pilot';

export const RECOVERY_DECISIONS = 10;

/**
 * Cheap check on System One's proposal: play it for one decision, then the
 * recovery policy for a short horizon; reject if that ends in a crash or out
 * of bounds. Cost = physics steps simulated.
 */
export class LanderGuard implements Guard {
  readonly name = 'lander-rollout-guard';
  private scratch = emptyState();

  check(env: LanderEnv, action: number): { ok: boolean; cost: number } & GuardResult {
    const s = copyState(env.state, this.scratch);
    let cost = simulateDecision(s, env.world, env.config, action);
    for (let d = 0; d < RECOVERY_DECISIONS && !s.end; d++) cost += simulateDecision(s, env.world, env.config, pilotAction(s, env.world, env.config));
    const ok = s.end !== 'crashed' && s.end !== 'out';
    return { ok, cost: Math.max(1, cost) };
  }
}
