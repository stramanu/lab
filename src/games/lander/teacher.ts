import type { Teacher, TeacherResult } from '../../core/types';
import type { LanderConfig } from './config';
import type { LanderEnv } from './env';
import { copyState, emptyState, simulateDecision, type ShipState } from './physics';
import { pilotAction } from './pilot';
import type { World } from './world';

export interface LanderTeacherConfig {
  /** Tree depth: 1 = each first action alone, 2 = every pair of actions, ... (4^depth rollouts). The cost knob. */
  depth: number;
  /** Decisions each tree action is held for (the first action is held for one decision only). */
  hold: number;
  /** Maximum decisions of each autopilot rollout after the tree. */
  rolloutHorizon: number;
  /**
   * Root-only bonus per action (none, main, left, right) that breaks the
   * remaining ties deterministically. Far below the landing/crash gap.
   */
  preference: [number, number, number, number];
  /** Extra root bonus for the autopilot's own action, so equivalent choices default to the base policy. */
  basePolicyBonus: number;
  /**
   * Satisficing margin in score points: every action whose outcome is within
   * this margin of the best is treated as equally good, and the preference
   * decides among them. 0 disables it.
   */
  satisfice: number;
}

export const DEFAULT_LANDER_TEACHER: LanderTeacherConfig = {
  depth: 2,
  hold: 1,
  rolloutHorizon: 400,
  preference: [0.3, 0.2, 0.1, 0],
  satisfice: 1,
  basePolicyBonus: 0.5,
};

/** Outcome cost of a rollout: the negated game score for a landing; crashes rank by impact. */
export function rolloutCost(s: ShipState, cfg: LanderConfig): number {
  if (s.end === 'landed') return -(100 + 50 * (s.fuel / cfg.fuel));
  if (s.end === 'crashed' || s.end === 'out') return 1000 + s.impactSpeed + Math.hypot(s.vx, s.vy);
  return 500; // still flying at the horizon or timed out
}

/**
 * System Two for the lander: a deterministic rollout algorithm (receding-
 * horizon MPC). For each first action it enumerates every continuation of
 * `depth − 1` held actions, then lets the autopilot fly to the end of the
 * episode in simulation, and scores the action by the best outcome found.
 * Because the simulation is exact and the plain autopilot continuation is
 * always among the candidates, the planner does no worse than the autopilot,
 * up to the satisficing margin. Cost = physics steps simulated.
 */
export class LanderTeacher implements Teacher {
  readonly name: string;
  readonly config: LanderTeacherConfig;
  private stack: ShipState[] = [];

  constructor(config: Partial<LanderTeacherConfig> = {}) {
    this.config = { ...DEFAULT_LANDER_TEACHER, ...config };
    this.name = `lander-rollout-d${this.config.depth}`;
    for (let i = 0; i <= this.config.depth + 1; i++) this.stack.push(emptyState());
  }

  score(env: LanderEnv): TeacherResult {
    const scores = new Float64Array(env.numActions);
    const counter = { steps: 0 };
    for (let a = 0; a < env.numActions; a++) {
      const s = copyState(env.state, this.stack[0]);
      counter.steps += simulateDecision(s, env.world, env.config, a);
      scores[a] = -this.search(s, 1, env.world, env.config, counter);
    }
    // Satisficing: outcomes within the margin of the best count as the best; the preference ranks them.
    let best = -Infinity;
    for (let a = 0; a < env.numActions; a++) best = Math.max(best, scores[a]);
    const base = pilotAction(env.state, env.world, env.config);
    for (let a = 0; a < env.numActions; a++) {
      if (this.config.satisfice > 0 && scores[a] >= best - this.config.satisfice) scores[a] = best;
      scores[a] += this.config.preference[a] + (a === base ? this.config.basePolicyBonus : 0);
    }
    return { scores, cost: Math.max(1, counter.steps) };
  }

  /** Best outcome cost reachable from `s` with `depth - level` more held actions, then the autopilot. */
  private search(s: ShipState, level: number, w: World, cfg: LanderConfig, counter: { steps: number }): number {
    if (s.end) return rolloutCost(s, cfg);
    if (level >= this.config.depth) return this.rollout(s, w, cfg, counter);
    let best = Infinity;
    for (let b = 0; b < 4; b++) {
      const c = copyState(s, this.stack[level]);
      for (let h = 0; h < this.config.hold && !c.end; h++) counter.steps += simulateDecision(c, w, cfg, b);
      best = Math.min(best, this.search(c, level + 1, w, cfg, counter));
    }
    return best;
  }

  private rollout(from: ShipState, w: World, cfg: LanderConfig, counter: { steps: number }): number {
    const s = copyState(from, this.stack[this.config.depth]);
    for (let d = 0; d < this.config.rolloutHorizon && !s.end; d++) counter.steps += simulateDecision(s, w, cfg, pilotAction(s, w, cfg));
    return rolloutCost(s, cfg);
  }
}
