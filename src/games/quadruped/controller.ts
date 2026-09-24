/**
 * Hand-written base controller: a trot gait generator (a phase oscillator with diagonal leg pairs
 * half a cycle apart, a simple central-pattern-generator scheme; Ijspeert 2008), Raibert-style foot
 * placement for balance (Raibert 1986), and position control of the legs through per-leg inverse
 * kinematics. Stance feet sweep backwards relative to their hips at the commanded speed (the legs
 * servo the body along), swing feet land at the Raibert touchdown point, and every hip is held at
 * the nominal height above its foot, which levels the trunk. The action modulates the controller
 * (Iscen et al. 2018): a = 0 is the base controller.
 */
import { ACTION_SCALE, JOINTS_PER_LEG, NUM_JOINTS, type QuadrupedConfig } from './config';
import { legInverse, quatAxisAngle, quatConj, quatMul, rotate, yawOf } from './kinematics';
import { standingHeight, type RobotState } from './robot';

export interface GaitConfig {
  /** Nominal trot frequency (Hz) and forward speed command (m/s). */
  frequency: number;
  speed: number;
  /** Standing time before the gait starts, and speed ramp duration (s). */
  standTime: number;
  rampTime: number;
  /** Swing foot clearance (m). */
  swingHeight: number;
  /** Raibert velocity-feedback gain (s). */
  kVelocity: number;
  /** Heading correction: stance sweep speed difference between the two sides per radian of yaw (m/s per rad). */
  kYaw: number;
}

/** Tuned without pushes on dev seeds 10001–10005 (EXPERIMENTS.md): no falls, ~0.35 m/s, tilt < 4°. */
export const DEFAULT_GAIT: GaitConfig = {
  frequency: 3,
  speed: 0.4,
  standTime: 0.5,
  rampTime: 1,
  swingHeight: 0.06,
  kVelocity: 0.05,
  kYaw: 1,
};

/** Diagonal pairs (leg order FR, FL, HR, HL): FR + HL in phase, FL + HR half a cycle later. */
const PHASE_OFFSET = [0, 0.5, 0.5, 0];

/** Controller memory: part of the environment state (copied by clone and snapshot). */
export interface ControllerState {
  phase: number;
  /** Per leg, foot target relative to the hip in the yaw frame (x, z) at the last lift-off. */
  liftoff: Array<[number, number]>;
  /** Stance (true) or swing, per leg, at the last control update. */
  stance: boolean[];
  /** Per leg, the current stance foot target (x, z), swept backwards during stance. */
  sweep: Array<[number, number]>;
}

export function initialControllerState(): ControllerState {
  const zeros = () => [0, 1, 2, 3].map((): [number, number] => [0, 0]);
  return { phase: 0, liftoff: zeros(), stance: [true, true, true, true], sweep: zeros() };
}

export function copyControllerState(s: ControllerState): ControllerState {
  const copy = (a: Array<[number, number]>) => a.map((p): [number, number] => [p[0], p[1]]);
  return { phase: s.phase, liftoff: copy(s.liftoff), stance: [...s.stance], sweep: copy(s.sweep) };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Advances the controller by `dt` seconds at simulated time `time` and returns the 12 joint targets.
 * The robot state is read at the control rate; `action` is held for the whole decision.
 */
export function controlStep(
  robot: RobotState,
  st: ControllerState,
  action: ArrayLike<number>,
  time: number,
  dt: number,
  cfg: QuadrupedConfig,
  gait: GaitConfig = DEFAULT_GAIT,
  out = new Float64Array(NUM_JOINTS),
): Float64Array {
  const walking = time >= gait.standTime;
  const frequency = gait.frequency + action[3] * ACTION_SCALE.frequency;
  if (walking) st.phase = (st.phase + frequency * dt) % 1;
  const speed = walking ? gait.speed * Math.min(1, (time - gait.standTime) / gait.rampTime) : 0;
  const stanceTime = 0.5 / frequency;

  // Yaw frame (heading, gravity-aligned) and the trunk's tilt within it.
  const yaw = yawOf(robot.rot);
  const toYaw = quatConj(quatAxisAngle([0, 1, 0], yaw));
  const [vx, , vz] = rotate(toYaw, robot.linvel);
  const toTrunk = quatConj(quatMul(toYaw, robot.rot));
  const height = standingHeight(cfg) + action[2] * ACTION_SCALE.height;

  for (let leg = 0; leg < 4; leg++) {
    const hz = cfg.hips[leg][1];
    // Turned left (yaw > 0, nose towards −z): the left side (z < 0) sweeps faster, which turns the body right.
    const sideSpeed = speed + gait.kYaw * yaw * -Math.sign(hz);
    // Raibert foot placement (yaw frame, relative to the hip): neutral point plus velocity-error feedback,
    // plus the action's offsets.
    const tdX = vx * stanceTime * 0.5 + gait.kVelocity * (vx - speed) + action[0] * ACTION_SCALE.forward;
    const tdZ = vz * stanceTime * 0.5 + gait.kVelocity * vz + action[1] * ACTION_SCALE.lateral;

    const s = walking ? (st.phase + PHASE_OFFSET[leg]) % 1 : 0;
    const stance = !walking || s < 0.5;
    if (stance && !st.stance[leg]) st.sweep[leg] = [tdX, tdZ]; // touchdown
    if (!stance && st.stance[leg]) st.liftoff[leg] = [st.sweep[leg][0], st.sweep[leg][1]];
    st.stance[leg] = stance;

    let x: number;
    let z: number;
    let lift = 0;
    if (stance) {
      if (walking) st.sweep[leg][0] -= sideSpeed * dt;
      [x, z] = st.sweep[leg];
    } else {
      const u = (s - 0.5) / 0.5;
      const e = smoothstep(u);
      x = st.liftoff[leg][0] + (tdX - st.liftoff[leg][0]) * e;
      z = st.liftoff[leg][1] + (tdZ - st.liftoff[leg][1]) * e;
      lift = gait.swingHeight * Math.sin(Math.PI * u);
    }
    // Foot relative to its own hip in the yaw frame, then in the trunk frame: every hip is held at the
    // nominal height above its foot, which levels the trunk (a tilted trunk extends its lower legs).
    const q = legInverse(rotate(toTrunk, [x, -height + lift, z]), cfg.thigh, cfg.shank);
    out.set(q, leg * JOINTS_PER_LEG);
  }
  return out;
}
