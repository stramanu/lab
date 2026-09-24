export interface LanderConfig {
  width: number;
  height: number;
  gravity: number;
  /** Physics time step in seconds. */
  dt: number;
  /** Physics steps per decision. */
  stepsPerDecision: number;
  /** Decisions before the episode times out. */
  maxDecisions: number;
  /** Main engine acceleration along the ship's up axis (m/s²). */
  mainThrust: number;
  /** Side thruster angular acceleration (rad/s²). */
  sideAngularAccel: number;
  /** Tank size in seconds of main-engine burn. */
  fuel: number;
  mainBurn: number;
  sideBurn: number;
  /** Landing limits. */
  maxLandingVy: number;
  maxLandingVx: number;
  maxLandingAngle: number;
  padWidth: number;
  /** Scales the seeded wind (0 disables it). */
  windScale: number;
  /** Extra constant wind (m/s²) added to the seeded wind; 0 in every experiment, set live by the demo. */
  windOffset: number;
}

export const DEFAULT_LANDER_CONFIG: LanderConfig = {
  width: 100,
  height: 70,
  gravity: 1.62,
  dt: 1 / 60,
  stepsPerDecision: 6,
  maxDecisions: 400,
  mainThrust: 4.0,
  sideAngularAccel: 3.0,
  fuel: 20,
  mainBurn: 1,
  sideBurn: 0.25,
  maxLandingVy: 2.0,
  maxLandingVx: 1.0,
  maxLandingAngle: 0.25,
  padWidth: 12,
  windScale: 1,
  windOffset: 0,
};

export const NONE = 0;
export const MAIN = 1;
export const LEFT = 2;
export const RIGHT = 3;
export const LANDER_ACTIONS = ['none', 'main', 'left', 'right'] as const;

export type LanderEndReason = 'landed' | 'crashed' | 'out' | 'timeout';
