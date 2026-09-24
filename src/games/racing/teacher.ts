import type { ContinuousGuard, ContinuousTeacher, GuardResult, TeacherResult } from '../../core/types';
import { BRAKE, GAS, STEER_HOLD, commandOf, pedalOf, type RacingConfig } from './config';
import { controllerAction } from './controller';
import type { RacingEnv } from './env';
import { copyCar, emptyCar, simulateControl, simulateDecision, type CarState } from './physics';
import type { Track } from './track';

export interface RacingTeacherConfig {
  /** Tree depth: 10^depth branches. The cost knob. */
  depth: number;
  /** Decisions of base-controller driving after the tree. */
  horizon: number;
  /** Outcomes within this many metres of the best count as equivalent (then the preference decides). */
  satisfice: number;
  /**
   * Speed margins tried by the base controller in the rollouts. The base
   * controller's own margin must be included, so the planner is never worse
   * than it within the horizon.
   */
  margins: number[];
}

export const DEFAULT_RACING_TEACHER: RacingTeacherConfig = { depth: 1, horizon: 40, satisfice: 0.5, margins: [0.85, 0.95, 1.05, 1.15, 1.25] };

/** Branch value: progress at the horizon plus a small credit for the speed carried; leaving the track is far worse. */
export function branchValue(c: CarState, start: CarState, remaining: number): number {
  if (c.end === 'off-track') return -1000 - 10 * remaining;
  return c.progress - start.progress + 0.5 * c.speed;
}

/**
 * System Two for racing: a deterministic rollout algorithm (Bertsekas et al. 1997).
 * For each action, every continuation of depth − 1 further one-decision actions,
 * then the base controller for `horizon` decisions at each speed margin in
 * `margins`; score = best branch value.
 * Near-equivalent actions (within `satisfice` m) are ranked by a root preference:
 * the base controller's action, then gas over brake, then holding the steering.
 */
export class RacingTeacher implements ContinuousTeacher {
  readonly name: string;
  readonly config: RacingTeacherConfig;
  private stack: CarState[] = [];

  constructor(config: Partial<RacingTeacherConfig> = {}) {
    this.config = { ...DEFAULT_RACING_TEACHER, ...config };
    this.name = `racing-rollout-d${this.config.depth}`;
    for (let i = 0; i <= this.config.depth + 1; i++) this.stack.push(emptyCar());
  }

  score(env: RacingEnv): TeacherResult {
    const counter = { steps: 0 };
    const n = env.numActions;
    const scores = new Float64Array(n);
    for (let a = 0; a < n; a++) {
      const c = copyCar(env.car, this.stack[0]);
      counter.steps += simulateDecision(c, env.track, env.config, a);
      scores[a] = this.search(c, 1, env, counter);
    }
    let best = -Infinity;
    for (let a = 0; a < n; a++) best = Math.max(best, scores[a]);
    const base = controllerAction(env.car, env.track, env.config);
    for (let a = 0; a < n; a++) {
      if (scores[a] >= best - this.config.satisfice) scores[a] = best;
      scores[a] += (a === base ? 0.3 : 0) + (pedalOf(a) === GAS ? 0.1 : 0) + (commandOf(a) === STEER_HOLD ? 0.02 : 0);
    }
    return { scores, cost: Math.max(1, counter.steps) };
  }

  /** Continuous equivalent of the planner's chosen command, with its cost (the regression label). */
  targetAction(env: RacingEnv): { action: Float64Array; cost: number; scores: Float64Array } {
    const r = this.score(env);
    let best = 0;
    for (let a = 1; a < r.scores.length; a++) if (r.scores[a] > r.scores[best]) best = a;
    return { action: env.continuousOf(best), cost: r.cost, scores: r.scores };
  }

  private search(c: CarState, level: number, env: RacingEnv, counter: { steps: number }): number {
    const remaining = this.config.horizon + this.config.depth - level;
    if (c.end) return branchValue(c, env.car, remaining);
    if (level >= this.config.depth) {
      let best = -Infinity;
      for (const m of this.config.margins) best = Math.max(best, this.rollout(c, env.car, env.track, env.config, counter, m));
      return best;
    }
    let best = -Infinity;
    for (let b = 0; b < env.numActions; b++) {
      const d = copyCar(c, this.stack[level]);
      counter.steps += simulateDecision(d, env.track, env.config, b);
      best = Math.max(best, this.search(d, level + 1, env, counter));
    }
    return best;
  }

  private rollout(from: CarState, start: CarState, track: Track, cfg: RacingConfig, counter: { steps: number }, margin: number): number {
    const c = copyCar(from, this.stack[this.config.depth]);
    let d = 0;
    for (; d < this.config.horizon && !c.end; d++) counter.steps += simulateDecision(c, track, cfg, controllerAction(c, track, cfg, margin));
    return branchValue(c, start, this.config.horizon - d);
  }
}

export const RECOVERY_DECISIONS = 10;

/** Cheap check: the proposed action for one decision, then the base controller; reject if the car leaves the track. */
export class RacingGuard implements ContinuousGuard {
  readonly name = 'racing-rollout-guard';
  private scratch = emptyCar();

  check(env: RacingEnv, a: number): GuardResult {
    const c = copyCar(env.car, this.scratch);
    let cost = simulateDecision(c, env.track, env.config, a);
    for (let d = 0; d < RECOVERY_DECISIONS && !c.end; d++) cost += simulateDecision(c, env.track, env.config, controllerAction(c, env.track, env.config));
    return { ok: c.end !== 'off-track', cost: Math.max(1, cost) };
  }

  checkContinuous(env: RacingEnv, a: ArrayLike<number>): GuardResult {
    const c = copyCar(env.car, this.scratch);
    let cost = simulateControl(c, env.track, env.config, a[0], a[1]);
    for (let d = 0; d < RECOVERY_DECISIONS && !c.end; d++) cost += simulateDecision(c, env.track, env.config, controllerAction(c, env.track, env.config));
    return { ok: c.end !== 'off-track', cost: Math.max(1, cost) };
  }
}

export { BRAKE };
