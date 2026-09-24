/**
 * Pure leg kinematics and quaternion helpers. Frames (right-handed): x forward, y up, z right.
 * A leg has hip abduction q0 about x, then hip flexion q1 and knee q2 about the
 * (abducted) z axis, with the right-hand rule: positive q1 swings the foot forward.
 * The knee bends backwards (q2 < 0).
 */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Vec3 = [number, number, number];

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatConj(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos(angle / 2) };
}

/** Rotates v by the unit quaternion q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w (u × v) + 2 u × (u × v), with u = (x, y, z).
  const [vx, vy, vz] = v;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
}

/** Rotation angle of `child` relative to `parent` about a unit axis of the parent frame, in (−π, π]. */
export function relativeAngle(parent: Quat, child: Quat, axis: Vec3): number {
  const r = quatMul(quatConj(parent), child);
  const s = r.x * axis[0] + r.y * axis[1] + r.z * axis[2];
  let a = 2 * Math.atan2(s, r.w);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Yaw of the trunk's forward axis about +y (rad; positive = nose turned towards −z, i.e. left). */
export function yawOf(q: Quat): number {
  const f = rotate(q, [1, 0, 0]);
  return Math.atan2(-f[2], f[0]);
}

/** Angle between the trunk's up axis and the vertical (rad). */
export function tiltOf(q: Quat): number {
  const up = rotate(q, [0, 1, 0]);
  return Math.acos(Math.max(-1, Math.min(1, up[1])));
}

/** Foot position relative to the hip, in the trunk frame, for joint angles q = [q0, q1, q2]. */
export function legForward(q: ArrayLike<number>, l1: number, l2: number): Vec3 {
  const x = l1 * Math.sin(q[1]) + l2 * Math.sin(q[1] + q[2]);
  const y = -(l1 * Math.cos(q[1]) + l2 * Math.cos(q[1] + q[2]));
  // Abduction: rotation about x of the planar leg (x, y, 0).
  return [x, y * Math.cos(q[0]), y * Math.sin(q[0])];
}

/**
 * Joint angles that put the foot at p (relative to the hip, trunk frame), knee bent backwards.
 * Unreachable targets are clamped to the nearest reachable length.
 */
export function legInverse(p: Vec3, l1: number, l2: number, out: number[] = [0, 0, 0]): number[] {
  const [px, py, pz] = p;
  const down = Math.hypot(py, pz);
  out[0] = Math.atan2(-pz, -py);
  const reach = Math.min(Math.max(Math.hypot(px, down), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const c = (reach * reach - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  out[2] = -Math.acos(Math.max(-1, Math.min(1, c)));
  out[1] = Math.atan2(px, down) - Math.atan2(l2 * Math.sin(out[2]), l1 + l2 * Math.cos(out[2]));
  return out;
}
