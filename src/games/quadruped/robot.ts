/**
 * The quadruped in a Rapier world: construction in a standing pose, joint targets
 * (force-based PD position motors), and state readout. Worlds are WebAssembly objects:
 * whoever creates or restores one must call `free()` on it.
 */
import type { RevoluteImpulseJoint, World } from '@dimforge/rapier3d-deterministic-compat';
import { JOINTS_PER_LEG, NUM_JOINTS, type QuadrupedConfig } from './config';
import { legInverse, quatAxisAngle, relativeAngle, rotate, type Quat, type Vec3 } from './kinematics';
import { rapier } from './rapier';

/** Collision groups: robot parts collide only with the ground. */
const GROUND_GROUPS = (0x0001 << 16) | 0xffff;
const ROBOT_GROUPS = (0x0002 << 16) | 0x0001;

/** Joint axes in the parent frame: abduction (x), flexion (z), knee (z). */
const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 0, 1],
];

/** Body and joint handles; they survive snapshot and restore. */
export interface RobotHandles {
  trunk: number;
  /** Per leg: hip, thigh, shank body handles. */
  hip: number[];
  thigh: number[];
  shank: number[];
  /** 12 joint handles, leg-major: abduction, flexion, knee. */
  joints: number[];
}

export interface RobotState {
  pos: Vec3;
  rot: Quat;
  linvel: Vec3;
  angvel: Vec3;
  /** Joint angles and velocities, leg-major (abduction, flexion, knee). */
  q: Float64Array;
  qd: Float64Array;
  /** Foot centres in world coordinates. */
  feet: Vec3[];
  contacts: boolean[];
}

/** Standing hip-to-foot height (m) used for the initial pose and as the controller's nominal height. */
export function standingHeight(cfg: QuadrupedConfig): number {
  return 0.75 * (cfg.thigh + cfg.shank);
}

export function buildRobot(cfg: QuadrupedConfig, friction: number): { world: World; handles: RobotHandles } {
  const R = rapier();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = cfg.dt;
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0).setFriction(friction).setCollisionGroups(GROUND_GROUPS));

  const h0 = standingHeight(cfg);
  const H = h0 + cfg.footRadius;
  const [q0, q1, q2] = legInverse([0, -h0, 0], cfg.thigh, cfg.shank);
  const body = (x: number, y: number, z: number, rot: Quat) =>
    world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(rot).setCanSleep(false));

  const trunk = body(0, H, 0, { x: 0, y: 0, z: 0, w: 1 });
  const [hx, hy, hz] = cfg.trunkHalf;
  world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setDensity(cfg.trunkDensity).setCollisionGroups(ROBOT_GROUPS), trunk);

  const handles: RobotHandles = { trunk: trunk.handle, hip: [], thigh: [], shank: [], joints: [] };
  const capsule = (len: number) => R.ColliderDesc.capsule(len / 2 - cfg.limbRadius, cfg.limbRadius).setDensity(cfg.limbDensity).setCollisionGroups(ROBOT_GROUPS);
  for (const [px, pz] of cfg.hips) {
    const hipRot = quatAxisAngle([1, 0, 0], q0);
    const thighRot = quatAxisAngle([0, 0, 1], q1);
    const shankRot = quatAxisAngle([0, 0, 1], q1 + q2);
    const hip = body(px, H, pz, hipRot);
    world.createCollider(R.ColliderDesc.ball(0.03).setDensity(cfg.limbDensity).setCollisionGroups(ROBOT_GROUPS), hip);
    const tc = rotate(thighRot, [0, -cfg.thigh / 2, 0]);
    const thigh = body(px + tc[0], H + tc[1], pz + tc[2], thighRot);
    world.createCollider(capsule(cfg.thigh), thigh);
    const knee = rotate(thighRot, [0, -cfg.thigh, 0]);
    const sc = rotate(shankRot, [0, -cfg.shank / 2, 0]);
    const shank = body(px + knee[0] + sc[0], H + knee[1] + sc[1], pz + knee[2] + sc[2], shankRot);
    world.createCollider(capsule(cfg.shank), shank);
    world.createCollider(
      R.ColliderDesc.ball(cfg.footRadius).setTranslation(0, -cfg.shank / 2, 0).setFriction(friction).setDensity(cfg.limbDensity).setCollisionGroups(ROBOT_GROUPS),
      shank,
    );
    const joints = [
      world.createImpulseJoint(R.JointData.revolute({ x: px, y: 0, z: pz }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), trunk, hip, true),
      world.createImpulseJoint(R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: cfg.thigh / 2, z: 0 }, { x: 0, y: 0, z: 1 }), hip, thigh, true),
      world.createImpulseJoint(R.JointData.revolute({ x: 0, y: -cfg.thigh / 2, z: 0 }, { x: 0, y: cfg.shank / 2, z: 0 }, { x: 0, y: 0, z: 1 }), thigh, shank, true),
    ];
    for (const j of joints) (j as RevoluteImpulseJoint).configureMotorModel(R.MotorModel.ForceBased);
    handles.hip.push(hip.handle);
    handles.thigh.push(thigh.handle);
    handles.shank.push(shank.handle);
    handles.joints.push(...joints.map((j) => j.handle));
  }
  const standing = Array.from({ length: NUM_JOINTS }, (_, k) => [q0, q1, q2][k % JOINTS_PER_LEG]);
  setJointTargets(world, handles, standing, cfg);
  return { world, handles };
}

export function setJointTargets(world: World, h: RobotHandles, targets: ArrayLike<number>, cfg: QuadrupedConfig): void {
  for (let k = 0; k < NUM_JOINTS; k++) {
    const joint = world.getImpulseJoint(h.joints[k]) as RevoluteImpulseJoint;
    joint.configureMotorPosition(targets[k], cfg.stiffness, cfg.damping);
  }
}

const v3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

export function readRobot(world: World, h: RobotHandles, cfg: QuadrupedConfig): RobotState {
  const trunk = world.getRigidBody(h.trunk);
  const rot = trunk.rotation();
  const q = new Float64Array(NUM_JOINTS);
  const qd = new Float64Array(NUM_JOINTS);
  const feet: Vec3[] = [];
  const contacts: boolean[] = [];
  for (let leg = 0; leg < h.hip.length; leg++) {
    const chain = [trunk, world.getRigidBody(h.hip[leg]), world.getRigidBody(h.thigh[leg]), world.getRigidBody(h.shank[leg])];
    for (let j = 0; j < JOINTS_PER_LEG; j++) {
      const parent = chain[j];
      const child = chain[j + 1];
      const pr = parent.rotation();
      q[leg * JOINTS_PER_LEG + j] = relativeAngle(pr, child.rotation(), AXES[j]);
      const axis = rotate(pr, AXES[j]);
      const wp = parent.angvel();
      const wc = child.angvel();
      qd[leg * JOINTS_PER_LEG + j] = (wc.x - wp.x) * axis[0] + (wc.y - wp.y) * axis[1] + (wc.z - wp.z) * axis[2];
    }
    const shank = chain[3];
    const off = rotate(shank.rotation(), [0, -cfg.shank / 2, 0]);
    const c = shank.translation();
    const foot: Vec3 = [c.x + off[0], c.y + off[1], c.z + off[2]];
    feet.push(foot);
    contacts.push(foot[1] <= cfg.footRadius + 0.004);
  }
  return { pos: v3(trunk.translation()), rot, linvel: v3(trunk.linvel()), angvel: v3(trunk.angvel()), q, qd, feet, contacts };
}

export function pushTrunk(world: World, h: RobotHandles, impulse: Vec3): void {
  world.getRigidBody(h.trunk).applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
}
