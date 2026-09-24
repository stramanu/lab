export interface RacingConfig {
  /** Physics time step (s) and steps per decision. */
  dt: number;
  stepsPerDecision: number;
  maxDecisions: number;
  trackWidth: number;
  /** Mean track radius (m). */
  radius: number;
  wheelbase: number;
  /** Tyre friction coefficient (lateral acceleration cap = mu * g). */
  mu: number;
  gravity: number;
  /** Steering servo rate (rad/s). */
  steerRate: number;
  /** Gas acceleration at rest (m/s²), fading linearly to zero at `topSpeed`. */
  gas: number;
  topSpeed: number;
  brake: number;
}

export const DEFAULT_RACING_CONFIG: RacingConfig = {
  dt: 0.02,
  stepsPerDecision: 5,
  maxDecisions: 600,
  trackWidth: 10,
  radius: 70,
  wheelbase: 2.6,
  mu: 1.1,
  gravity: 9.81,
  steerRate: 2.5,
  gas: 6,
  topSpeed: 45,
  brake: 10,
};

/**
 * Incremental steering commands × pedal. A command moves the steering target by
 * STEER_STEP (positive = left), clamped to ±MAX_STEER; HOLD keeps it. Holding a
 * corner therefore means choosing HOLD repeatedly, instead of alternating two
 * fixed steering levels (the equivalence that capped imitation in the first spike).
 * Action = command * 2 + pedal.
 */
export const STEER_LEFT = 0;
export const STEER_HOLD = 1;
export const STEER_RIGHT = 2;
export const STEER_STEP = 0.06;
export const MAX_STEER = 0.3;
export const GAS = 0;
export const BRAKE = 1;
export const RACING_ACTIONS = ['left', 'hold', 'right'].flatMap((s) => [`${s} gas`, `${s} brake`]);

export const action = (command: number, pedal: number) => command * 2 + pedal;
export const commandOf = (a: number) => a >> 1;
export const pedalOf = (a: number) => a & 1;

export type RacingEndReason = 'off-track' | 'timeout';

/** Continuous agreement rule for racing: steering within half a command step and the same pedal sign. */
export const STEER_TOLERANCE = STEER_STEP / 2;
export function racingAgrees(student: ArrayLike<number>, planner: ArrayLike<number>): boolean {
  return Math.abs(student[0] - planner[0]) <= STEER_TOLERANCE && student[1] >= 0 === planner[1] > 0;
}
