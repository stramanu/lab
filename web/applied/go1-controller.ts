/**
 * The Go1 joystick task of MuJoCo Playground, reproduced on DeepMind's MuJoCo WebAssembly build (applied
 * side): the same motor gains, the same 48-value observation (without noise), the same motor targets and
 * the same fall rule, so that a policy trained in Playground can drive the robot in the browser.
 * Source: mujoco_playground/_src/locomotion/go1/{base.py, joystick.py} (Playground 0.2.0).
 */
import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { Rng } from '../../src/core/rng';

export interface Go1Constants {
  ctrl_dt: number;
  sim_dt: number;
  action_scale: number;
  Kp: number;
  Kd: number;
  default_pose: number[];
}

/** Playground's Go1 joystick defaults (joystick.py), used when an export does not carry its own. */
export const GO1_DEFAULTS: Go1Constants = { ctrl_dt: 0.02, sim_dt: 0.004, action_scale: 0.5, Kp: 35, Kd: 0.5, default_pose: [0.1, 0.9, -1.8, -0.1, 0.9, -1.8, 0.1, 0.9, -1.8, -0.1, 0.9, -1.8] };

export class Go1Task {
  readonly substeps: number;
  readonly lastAct = new Float64Array(12);
  private readonly adr: { gyro: number; linvel: number; upvector: number };
  private readonly imu: number;

  constructor(
    private readonly mujoco: MainModule,
    readonly model: MjModel,
    readonly data: MjData,
    readonly c: Go1Constants = GO1_DEFAULTS,
  ) {
    // base.py: joint damping Kd on the 12 leg joints, position servos with gain Kp.
    const damping = model.dof_damping as Float64Array;
    for (let i = 6; i < damping.length; i++) damping[i] = c.Kd;
    const gain = model.actuator_gainprm as Float64Array;
    const bias = model.actuator_biasprm as Float64Array;
    const nu = model.nu as number;
    const stride = gain.length / nu;
    for (let a = 0; a < nu; a++) {
      gain[a * stride] = c.Kp;
      bias[a * stride + 1] = -c.Kp;
    }
    const sensor = (name: string) => {
      const id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SENSOR.value, name);
      if (id < 0) throw new Error(`No sensor ${name}`);
      return (model.sensor_adr as Int32Array)[id];
    };
    this.adr = { gyro: sensor('gyro'), linvel: sensor('local_linvel'), upvector: sensor('upvector') };
    this.imu = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE.value, 'imu');
    if (this.imu < 0) throw new Error('No imu site');
    this.substeps = Math.round(c.ctrl_dt / (model.opt.timestep as number));
  }

  /**
   * joystick.py reset: the "home" keyframe, then x and y shifted by U(−0.5, 0.5), the heading turned by
   * U(−3.14, 3.14), and the base's six velocities drawn from U(−0.5, 0.5). Seeded here with the lab's RNG
   * (the draws differ from JAX's, the distribution is the same).
   */
  reset(seed: number): void {
    const { mujoco, model, data } = this;
    mujoco.mj_resetDataKeyframe(model, data, 0);
    const rng = Rng.stream(seed, 'go1-reset');
    const u = (lo: number, hi: number) => lo + (hi - lo) * rng.next();
    const q = data.qpos as Float64Array;
    q[0] += u(-0.5, 0.5);
    q[1] += u(-0.5, 0.5);
    const yaw = u(-3.14, 3.14);
    const [w, x, y, z] = [q[3], q[4], q[5], q[6]];
    const [cw, sz] = [Math.cos(yaw / 2), Math.sin(yaw / 2)]; // quat_mul(q, (cos, 0, 0, sin))
    q[3] = w * cw - z * sz;
    q[4] = x * cw + y * sz;
    q[5] = y * cw - x * sz;
    q[6] = z * cw + w * sz;
    const v = data.qvel as Float64Array;
    for (let i = 0; i < 6; i++) v[i] = u(-0.5, 0.5);
    this.lastAct.fill(0);
    mujoco.mj_forward(model, data);
  }

  /** The 48-value 'state' observation of joystick.py, without noise. */
  observe(command: ArrayLike<number>, out = new Float64Array(48)): Float64Array {
    const s = this.data.sensordata as Float64Array;
    const q = this.data.qpos as Float64Array;
    const qd = this.data.qvel as Float64Array;
    const R = this.data.site_xmat as Float64Array;
    let o = 0;
    for (let i = 0; i < 3; i++) out[o++] = s[this.adr.linvel + i];
    for (let i = 0; i < 3; i++) out[o++] = s[this.adr.gyro + i];
    // Gravity in the IMU frame: R^T (0, 0, −1) = −(third row of R).
    for (let i = 0; i < 3; i++) out[o++] = -R[this.imu * 9 + 6 + i];
    for (let i = 0; i < 12; i++) out[o++] = q[7 + i] - this.c.default_pose[i];
    for (let i = 0; i < 12; i++) out[o++] = qd[6 + i];
    for (let i = 0; i < 12; i++) out[o++] = this.lastAct[i];
    for (let i = 0; i < 3; i++) out[o++] = command[i];
    return out;
  }

  /** One control step (ctrl_dt): motor targets = default pose + action × action_scale, then the substeps. */
  act(action: ArrayLike<number>): void {
    const ctrl = this.data.ctrl as Float64Array;
    for (let i = 0; i < 12; i++) {
      ctrl[i] = this.c.default_pose[i] + action[i] * this.c.action_scale;
      this.lastAct[i] = action[i];
    }
    for (let k = 0; k < this.substeps; k++) this.mujoco.mj_step(this.model, this.data);
  }

  /** joystick.py termination: the up vector's world z below zero. */
  fell(): boolean {
    return (this.data.sensordata as Float64Array)[this.adr.upvector + 2] < 0;
  }

  /** The body's forward direction in the world's xy plane (unit), from the base quaternion. */
  heading(): [number, number] {
    const q = this.data.qpos as Float64Array;
    const [w, x, y, z] = [q[3], q[4], q[5], q[6]];
    const hx = 1 - 2 * (y * y + z * z);
    const hy = 2 * (x * y + w * z);
    const n = Math.hypot(hx, hy);
    return [hx / n, hy / n];
  }
}
