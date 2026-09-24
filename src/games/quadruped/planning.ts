import type { ContinuousGuard, ContinuousTeacher, GuardResult, TeacherResult } from '../../core/types';
import { CANDIDATES } from './config';
import type { QuadrupedEnv, QuadrupedSnapshot } from './env';
import { tiltOf } from './kinematics';

const ZERO = [0, 0, 0, 0] as const;

export interface QuadrupedTeacherConfig {
  /** Rollout horizon in decisions (5 / 10 / 20 = 0.5 / 1 / 2 s). The cost knob. */
  horizon: number;
  /** Outcomes within this many metres of the best count as equivalent (then the base controller is preferred). */
  satisfice: number;
  /** Preference for the zero action (the base controller), in metres. */
  baseBonus: number;
  /** Penalty for a fall within the horizon, in metres. */
  fallPenalty: number;
  /** Stability term: metres of progress per radian of maximum trunk tilt during the rollout. */
  tiltWeight: number;
}

/**
 * Spike v2 values (design.md, "Revision after spike v1"): the tilt weight makes reaching the fall limit
 * (60°) cost one second of base-controller walking (0.4 m); the margin is the base gait's own 1 s
 * variability (`pnpm exp quadruped-margin`).
 */
export const DEFAULT_QUADRUPED_TEACHER: QuadrupedTeacherConfig = { horizon: 10, satisfice: 0.0057, baseBonus: 0.02, fallPenalty: 100, tiltWeight: 0.4 / (Math.PI / 3) };

/**
 * System Two for the quadruped: a rollout algorithm over the base controller (Bertsekas et al. 1997).
 * Each of the 21 candidate modulations is applied for one decision from a physics snapshot of the
 * current state, then the base controller (a = 0) runs to the horizon; rollouts contain no pushes,
 * so the planner does not see the future. Score = forward progress, minus a stability term (the maximum
 * trunk tilt during the rollout) and a penalty for a fall.
 * Holding the candidate for one decision keeps the guarantee of doing no worse than the base
 * controller within the horizon. Cost = physics steps simulated.
 */
export class QuadrupedTeacher implements ContinuousTeacher {
  readonly name: string;
  readonly config: QuadrupedTeacherConfig;

  constructor(config: Partial<QuadrupedTeacherConfig> = {}) {
    this.config = { ...DEFAULT_QUADRUPED_TEACHER, ...config };
    this.name = `quadruped-rollout-h${this.config.horizon}`;
  }

  score(env: QuadrupedEnv): TeacherResult {
    const snap = env.snapshot();
    const start = env.score();
    const scores = new Float64Array(CANDIDATES.length);
    let cost = 0;
    for (let a = 0; a < CANDIDATES.length; a++) {
      const sim = env.restore(snap, { pushes: false });
      cost += sim.advance(CANDIDATES[a]);
      let maxTilt = tiltOf(sim.robot.rot);
      for (let d = 1; d < this.config.horizon && !sim.end; d++) {
        cost += sim.advance(ZERO);
        maxTilt = Math.max(maxTilt, tiltOf(sim.robot.rot));
      }
      scores[a] = sim.score() - start - this.config.tiltWeight * maxTilt - (sim.end === 'fall' ? this.config.fallPenalty : 0);
      sim.dispose();
    }
    let best = -Infinity;
    for (const v of scores) best = Math.max(best, v);
    for (let a = 0; a < scores.length; a++) if (scores[a] >= best - this.config.satisfice) scores[a] = best;
    scores[0] += this.config.baseBonus;
    return { scores, cost: Math.max(1, cost) };
  }

  /** The chosen candidate as a continuous action, with its cost (the regression label). */
  targetAction(env: QuadrupedEnv): { action: Float64Array; cost: number; scores: Float64Array } {
    const r = this.score(env);
    let best = 0;
    for (let a = 1; a < r.scores.length; a++) if (r.scores[a] > r.scores[best]) best = a;
    return { action: Float64Array.from(CANDIDATES[best]), cost: r.cost, scores: r.scores };
  }
}

/** Guard rollout: the proposed action for one decision, then the base controller, 0.2 s in total. */
export const GUARD_DECISIONS = 2;
export const GUARD_MAX_TILT = (45 * Math.PI) / 180;

/**
 * Cheap check: simulate the proposed action for 0.2 s from a snapshot, without pushes, and reject it
 * if the robot falls or tilts beyond 45°. Cost = physics steps simulated.
 */
export class QuadrupedGuard implements ContinuousGuard {
  readonly name = 'quadruped-rollout-guard';

  check(env: QuadrupedEnv, a: number): GuardResult {
    return this.checkContinuous(env, CANDIDATES[a]);
  }

  checkContinuous(env: QuadrupedEnv, action: ArrayLike<number>): GuardResult {
    return guardRollout(env, env.snapshot(), action);
  }
}

function guardRollout(env: QuadrupedEnv, snap: QuadrupedSnapshot, action: ArrayLike<number>): GuardResult {
  const sim = env.restore(snap, { pushes: false });
  let cost = 0;
  let ok = true;
  for (let d = 0; d < GUARD_DECISIONS && !sim.end; d++) {
    cost += sim.advance(d === 0 ? action : ZERO);
    if (sim.end === 'fall' || tiltOf(sim.robot.rot) > GUARD_MAX_TILT) ok = false;
  }
  sim.dispose();
  return { ok, cost: Math.max(1, cost) };
}
