/** Robot, physics, episode and action parameters of the quadruped (starting values, tuned in the spike on dev seeds). */

export interface QuadrupedConfig {
  /** Physics time step (s). */
  dt: number;
  /** Physics steps per decision (10 Hz decisions at dt = 5 ms). */
  stepsPerDecision: number;
  /** Physics steps between two updates of the joint targets by the controller. */
  stepsPerControl: number;
  /** Episode length (s). */
  duration: number;
  /** Constraint solver: iterations and internal PGS iterations (Rapier's defaults, 4 and 1, let the legs sag). */
  solverIterations: number;
  pgsIterations: number;

  // Robot geometry (m) and mass.
  trunkHalf: [number, number, number];
  trunkDensity: number;
  /** Hip positions (x, z) in the trunk frame: x forward, y up, z right (right-handed). Order: FR, FL, HR, HL. */
  hips: Array<[number, number]>;
  thigh: number;
  shank: number;
  limbRadius: number;
  footRadius: number;
  limbDensity: number;
  /** Ground friction coefficient, drawn per episode from this range (seeded). */
  frictionRange: [number, number];

  // Joint motors (force-based PD).
  stiffness: number;
  damping: number;

  // Falls.
  minHeight: number;
  maxTiltDeg: number;

  // Pushes: first at U(pushFirst), then every U(pushEvery) s; impulse magnitude U(0.5, 1)·pushImpulse (N·s).
  pushFirst: [number, number];
  pushEvery: [number, number];
  pushImpulse: number;
}

export const DEFAULT_QUADRUPED_CONFIG: QuadrupedConfig = {
  dt: 0.005,
  stepsPerDecision: 20,
  stepsPerControl: 2,
  duration: 20,
  solverIterations: 4,
  pgsIterations: 4,

  trunkHalf: [0.25, 0.06, 0.12],
  trunkDensity: 400,
  hips: [
    [0.2, 0.12],
    [0.2, -0.12],
    [-0.2, 0.12],
    [-0.2, -0.12],
  ],
  thigh: 0.18,
  shank: 0.18,
  limbRadius: 0.02,
  footRadius: 0.022,
  limbDensity: 1500,
  frictionRange: [0.7, 1.1],

  stiffness: 300,
  damping: 8,

  minHeight: 0.12,
  maxTiltDeg: 60,

  pushFirst: [1.5, 3],
  pushEvery: [1.5, 3],
  /** Calibrated in the spike by the pre-registered rule: the base controller falls on 20% of 20 dev seeds (EXPERIMENTS.md). */
  pushImpulse: 8,
};

export const LEG_NAMES = ['FR', 'FL', 'HR', 'HL'] as const;
export const JOINTS_PER_LEG = 3;
export const NUM_JOINTS = 12;

/** Action components in [−1, 1] and their physical ranges (design.md). */
export const ACTION_LABELS = ['forward placement', 'lateral placement', 'body height', 'step frequency'] as const;
export const ACTION_SCALE = { forward: 0.08, lateral: 0.06, height: 0.04, frequency: 0.5 } as const;

/**
 * The planner's fixed candidate set (21): zero, ±0.5 and ±1 along each axis,
 * and the four (±1, ±1) diagonals of the foot-placement plane.
 */
export const CANDIDATES: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  const list: Array<[number, number, number, number]> = [[0, 0, 0, 0]];
  for (let axis = 0; axis < 4; axis++) {
    for (const v of [-1, -0.5, 0.5, 1]) {
      const a: [number, number, number, number] = [0, 0, 0, 0];
      a[axis] = v;
      list.push(a);
    }
  }
  for (const f of [-1, 1]) for (const l of [-1, 1]) list.push([f, l, 0, 0]);
  return list;
})();

export const CANDIDATE_NAMES = CANDIDATES.map((c) =>
  c.every((v) => v === 0) ? 'base' : c.map((v, i) => (v ? `${['fwd', 'lat', 'height', 'freq'][i]}${v > 0 ? '+' : ''}${v}` : '')).filter(Boolean).join(' '),
);
