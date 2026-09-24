/**
 * Game-agnostic common contract (inspired by Jev / Rizzo Flow).
 * The same pipeline serves Snake and later games: only the Env changes.
 */

export interface StepResult {
  /** Reward of this single step. */
  reward: number;
  /** True if the episode has ended. */
  done: boolean;
  /** Current episode score. */
  score: number;
}

export interface GameSummary {
  score: number;
  steps: number;
  /** Game-specific end reason (e.g. "wall", "body", "starvation", "win"). */
  endReason: string;
  /** Additional game-specific metrics. */
  metrics: Record<string, number>;
}

export interface Env {
  readonly name: string;
  readonly numActions: number;
  readonly actionNames: readonly string[];
  /** Fixed length of the vector produced by encode(). */
  readonly encodingSize: number;
  /** Action applied by default when a decision arrives late. */
  readonly defaultAction: number;

  reset(seed: number): void;
  step(action: number): StepResult;
  /** Legality mask of length numActions. */
  legalActions(): boolean[];
  /** Encodes the current state; if `out` is given it is filled and returned. */
  encode(out?: Float32Array): Float32Array;
  render(): string;
  isDone(): boolean;
  score(): number;
  summary(): GameSummary;
  /** Independent copy, used by planners to simulate. */
  clone(): Env;
}

export interface TeacherResult {
  /** One score per action; -Infinity for illegal actions. Higher is better. */
  scores: Float64Array;
  /** Decision cost in integer compute units. */
  cost: number;
}

export interface Teacher {
  readonly name: string;
  score(env: Env): TeacherResult;
}

export interface Decision {
  choice: number;
  /** Distribution over actions, zero on illegal ones. */
  probs: Float32Array;
  /** Confidence in [0, 1]. */
  confidence: number;
  /** Cost in compute units (one forward pass = 1). */
  cost: number;
}

export interface Student {
  readonly name: string;
  decide(state: Float32Array, legal: readonly boolean[]): Decision;
}

/** Result of a guard check on one proposed action. */
export interface GuardResult {
  ok: boolean;
  /** Cost of the check in integer compute units. */
  cost: number;
}

/**
 * Cheap, deterministic verification of a single proposed action.
 * Must not mutate the environment and must cost less than a teacher query.
 */
export interface Guard {
  readonly name: string;
  check(env: Env, action: number): GuardResult;
}

export type Decider = 'system1' | 'system2' | 'random' | 'baseline';

export type EscalationReason = 'confidence' | 'guard';

export interface MoveRecord {
  action: number;
  decider: Decider;
  cost: number;
  confidence?: number;
  probs?: Float32Array;
  /** Known only when the teacher was queried. */
  agreed?: boolean;
  /** Present when the teacher was queried (escalation or audit). */
  teacherScores?: Float64Array;
  /** Why the move escalated to System Two (hybrid only). */
  escalationReason?: EscalationReason;
  /** Cost of the guard check, when a guard ran (included in `cost`). */
  guardCost?: number;
  /** True when the teacher was queried only to audit a confident student decision. */
  audited?: boolean;
  /** Encoding of the state the decision was made on (set by players that encode). */
  state?: Float32Array;
  /** Continuous action to play instead of the discrete `action` (continuous games). */
  continuous?: Float64Array;
  /** The planner's continuous action, when it was queried (continuous games). */
  teacherAction?: Float64Array;
}

/** Optional continuous-action extension of an environment (shares the physics of the discrete step). */
export interface ContinuousEnv extends Env {
  readonly actionDim: number;
  readonly actionLow: readonly number[];
  readonly actionHigh: readonly number[];
  stepContinuous(action: ArrayLike<number>): StepResult;
  /** Continuous equivalent of a discrete action in the current state. */
  continuousOf(action: number): Float64Array;
}

/** A teacher that can also return its chosen action in continuous form (the regression label). */
export interface ContinuousTeacher extends Teacher {
  targetAction(env: Env): { action: Float64Array; cost: number; scores: Float64Array };
}

/** A guard that can check a continuous action. */
export interface ContinuousGuard extends Guard {
  checkContinuous(env: Env, action: ArrayLike<number>): GuardResult;
}

/** A generic player: what the evaluation compares. */
export interface Player {
  readonly name: string;
  act(env: Env): MoveRecord;
  /**
   * Called before each evaluation episode with its seed. Players with their own randomness reseed
   * here, so results do not depend on the order of episodes or on how seeds are split across workers.
   */
  reset?(episodeSeed: number): void;
}

/** Index of the maximum among legal actions (first one on ties). */
export function argmax(values: ArrayLike<number>, legal?: readonly boolean[]): number {
  let best = -1;
  let bestV = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (legal && !legal[i]) continue;
    if (best === -1 || values[i] > bestV) {
      best = i;
      bestV = values[i];
    }
  }
  return best;
}
