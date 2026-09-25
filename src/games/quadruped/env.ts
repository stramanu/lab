import type { World } from '@dimforge/rapier3d-deterministic-compat';
import { Rng } from '../../core/rng';
import type { ContinuousEnv, GameSummary, StepResult } from '../../core/types';
import { CANDIDATE_NAMES, CANDIDATES, DEFAULT_QUADRUPED_CONFIG, NUM_JOINTS, type QuadrupedConfig } from './config';
import { controlStep, copyControllerState, DEFAULT_GAIT, initialControllerState, type ControllerState, type GaitConfig } from './controller';
import { rotate, quatConj, tiltOf, yawOf, type Vec3 } from './kinematics';
import { rapier } from './rapier';
import { buildRobot, pushTrunk, readRobot, setJointTargets, standingHeight, type RobotHandles, type RobotState } from './robot';
import { FLAT_TERRAIN, generateTerrain, hillHeight, type TerrainSpec } from './terrain';

export const QUADRUPED_ENCODING_SIZE = 46;

export interface Push {
  time: number;
  impulse: Vec3;
}

/** Everything needed to recreate an environment exactly: the physics snapshot and the controller's memory. */
export interface QuadrupedSnapshot {
  physics: Uint8Array;
  time: number;
  steps: number;
  decisions: number;
  controller: ControllerState;
  lastAction: Float64Array;
  pushes: readonly Push[];
  nextPush: number;
  lastPush: Push | null;
  end: 'fall' | 'timeout' | null;
  terrain: TerrainSpec;
}

/**
 * A 12-joint quadruped walking forward on flat ground (or on seeded procedural terrain, see terrain.ts) in deterministic 3D rigid-body physics
 * (Rapier), hit by seeded horizontal pushes. One decision every 100 ms modulates the base
 * controller; the score is the forward displacement (m). Worlds are WebAssembly objects:
 * call `dispose()` on copies that are no longer needed (the planner does).
 */
export class QuadrupedEnv implements ContinuousEnv {
  readonly name = 'quadruped';
  readonly numActions = CANDIDATES.length;
  readonly actionNames = CANDIDATE_NAMES;
  readonly encodingSize: number = QUADRUPED_ENCODING_SIZE;
  readonly defaultAction = 0;
  readonly actionDim = 4;
  readonly actionLow = [-1, -1, -1, -1] as const;
  readonly actionHigh = [1, 1, 1, 1] as const;
  readonly config: QuadrupedConfig;
  readonly gait: GaitConfig;

  world: World | null = null;
  handles: RobotHandles | null = null;
  robot!: RobotState;
  time = 0;
  /** Physics steps since the start of the episode (sets the control rate's phase). */
  steps = 0;
  decisions = 0;
  controller: ControllerState = initialControllerState();
  lastAction = new Float64Array(4);
  pushes: readonly Push[] = [];
  nextPush = 0;
  lastPush: Push | null = null;
  end: 'fall' | 'timeout' | null = null;
  /** Ground friction of this episode (seeded). */
  friction = 0;
  /** Terrain of this episode (seeded; flat by default). */
  terrain: TerrainSpec = FLAT_TERRAIN;
  /** Called after every physics step of this environment (not of its copies); used by the page to animate. */
  onPhysicsStep: ((env: QuadrupedEnv) => void) | null = null;
  private targets = new Float64Array(NUM_JOINTS);

  constructor(config: Partial<QuadrupedConfig> = {}, gait: Partial<GaitConfig> = {}) {
    rapier(); // fails early, with a clear message, before the physics is initialised
    this.config = { ...DEFAULT_QUADRUPED_CONFIG, ...config };
    this.gait = { ...DEFAULT_GAIT, ...gait };
  }

  reset(seed: number): void {
    this.dispose();
    const [lo, hi] = this.config.frictionRange;
    this.friction = lo + (hi - lo) * Rng.stream(seed, 'quadruped-friction').next();
    this.terrain = generateTerrain(seed, this.config.terrain);
    const { world, handles } = buildRobot(this.config, this.friction, this.terrain);
    this.world = world;
    this.handles = handles;
    this.configureWorld();
    this.time = 0;
    this.steps = 0;
    this.decisions = 0;
    this.controller = initialControllerState();
    this.lastAction = new Float64Array(4);
    this.end = null;
    this.lastPush = null;
    this.nextPush = 0;
    this.pushes = schedulePushes(seed, this.config);
    this.robot = readRobot(world, handles, this.config, this.terrain);
  }

  /** Trunk height above the hills directly below it (on flat ground: its height). */
  trunkHeight(): number {
    const p = this.robot.pos;
    return p[1] - hillHeight(this.terrain, p[0], p[2]);
  }

  private configureWorld(): void {
    const w = this.world!;
    w.timestep = this.config.dt;
    w.integrationParameters.numSolverIterations = this.config.solverIterations;
    w.integrationParameters.numInternalPgsIterations = this.config.pgsIterations;
  }

  /** Plays one decision (100 ms) with a continuous action; returns the physics steps simulated. */
  advance(action: ArrayLike<number>): number {
    if (this.end || !this.world || !this.handles) return 0;
    const cfg = this.config;
    for (let k = 0; k < 4; k++) this.lastAction[k] = Math.max(-1, Math.min(1, action[k]));
    let simulated = 0;
    for (let i = 0; i < cfg.stepsPerDecision; i++) {
      if (this.steps % cfg.stepsPerControl === 0) {
        this.robot = readRobot(this.world, this.handles, cfg, this.terrain);
        controlStep(this.robot, this.controller, this.lastAction, this.time, cfg.dt * cfg.stepsPerControl, cfg, this.gait, this.targets);
        setJointTargets(this.world, this.handles, this.targets, cfg);
      }
      while (this.nextPush < this.pushes.length && this.pushes[this.nextPush].time <= this.time) {
        this.lastPush = this.pushes[this.nextPush++];
        pushTrunk(this.world, this.handles, this.lastPush.impulse);
      }
      this.world.step();
      this.time += cfg.dt;
      this.steps++;
      simulated++;
      this.onPhysicsStep?.(this);
    }
    this.decisions++;
    this.robot = readRobot(this.world, this.handles, cfg, this.terrain);
    if (this.trunkHeight() < cfg.minHeight || tiltOf(this.robot.rot) > (cfg.maxTiltDeg * Math.PI) / 180) this.end = 'fall';
    else if (this.time >= cfg.duration - 1e-9) this.end = 'timeout';
    return simulated;
  }

  stepContinuous(action: ArrayLike<number>): StepResult {
    const before = this.score();
    this.advance(action);
    return { reward: this.score() - before, done: this.end !== null, score: this.score() };
  }

  step(a: number): StepResult {
    return this.stepContinuous(CANDIDATES[a]);
  }

  continuousOf(a: number): Float64Array {
    return Float64Array.from(CANDIDATES[a]);
  }

  legalActions(): boolean[] {
    return new Array(this.numActions).fill(true);
  }

  /**
   * 46 proprioceptive values: trunk height (above the hills below it), gravity direction in the trunk frame, heading (sin, cos),
   * trunk linear and angular velocity in the trunk frame, 12 joint angles and velocities,
   * 4 foot contacts, gait phase (sin, cos) and the last action.
   */
  encode(out = new Float32Array(QUADRUPED_ENCODING_SIZE)): Float32Array {
    const r = this.robot;
    const inv = quatConj(r.rot);
    const g = rotate(inv, [0, -1, 0]);
    const v = rotate(inv, r.linvel);
    const w = rotate(inv, r.angvel);
    const yaw = yawOf(r.rot);
    let o = 0;
    out[o++] = (this.trunkHeight() - standingHeight(this.config)) / 0.1;
    for (const x of g) out[o++] = x;
    out[o++] = Math.sin(yaw);
    out[o++] = Math.cos(yaw);
    for (const x of v) out[o++] = x;
    for (const x of w) out[o++] = x / 5;
    for (let k = 0; k < NUM_JOINTS; k++) out[o++] = r.q[k];
    for (let k = 0; k < NUM_JOINTS; k++) out[o++] = Math.max(-3, Math.min(3, r.qd[k] / 10));
    for (const c of r.contacts) out[o++] = c ? 1 : 0;
    out[o++] = Math.sin(2 * Math.PI * this.controller.phase);
    out[o++] = Math.cos(2 * Math.PI * this.controller.phase);
    for (let k = 0; k < 4; k++) out[o++] = this.lastAction[k];
    return out;
  }

  isDone(): boolean {
    return this.end !== null;
  }

  /** Forward displacement of the trunk along +x since the start (m). */
  score(): number {
    return this.robot ? this.robot.pos[0] : 0;
  }

  summary(): GameSummary {
    return {
      score: this.score(),
      steps: this.decisions,
      endReason: this.end ?? 'running',
      metrics: { fell: this.end === 'fall' ? 1 : 0, time: this.time, meanSpeed: this.time > 0 ? this.score() / this.time : 0, friction: this.friction },
    };
  }

  render(): string {
    const r = this.robot;
    return `x=${r.pos[0].toFixed(2)}m height=${r.pos[1].toFixed(3)}m tilt=${((tiltOf(r.rot) * 180) / Math.PI).toFixed(1)}° yaw=${((yawOf(r.rot) * 180) / Math.PI).toFixed(1)}° t=${this.time.toFixed(2)}s end=${this.end ?? 'walking'}`;
  }

  snapshot(): QuadrupedSnapshot {
    if (!this.world) throw new Error('No episode: call reset() first');
    return {
      physics: this.world.takeSnapshot(),
      time: this.time,
      steps: this.steps,
      decisions: this.decisions,
      controller: copyControllerState(this.controller),
      lastAction: Float64Array.from(this.lastAction),
      pushes: this.pushes,
      nextPush: this.nextPush,
      lastPush: this.lastPush,
      end: this.end,
      terrain: this.terrain,
    };
  }

  /** A new environment in the snapshot's state. `pushes: false` drops future pushes (planner rollouts do not see the future). */
  restore(s: QuadrupedSnapshot, options: { pushes?: boolean } = {}): QuadrupedEnv {
    const e = QuadrupedEnv.fromSnapshot(s, this.handles!, this.config, this.gait, options);
    e.friction = this.friction;
    return e;
  }

  /** Recreates an environment from a snapshot anywhere (e.g. in a worker), given the robot's handles and configuration. */
  static fromSnapshot(s: QuadrupedSnapshot, handles: RobotHandles, config: QuadrupedConfig, gait: GaitConfig, options: { pushes?: boolean } = {}): QuadrupedEnv {
    const e = new QuadrupedEnv(config, gait);
    e.world = rapier().World.restoreSnapshot(s.physics);
    e.handles = handles;
    e.configureWorld();
    e.time = s.time;
    e.steps = s.steps;
    e.decisions = s.decisions;
    e.controller = copyControllerState(s.controller);
    e.lastAction = Float64Array.from(s.lastAction);
    e.pushes = options.pushes === false ? [] : s.pushes;
    e.nextPush = options.pushes === false ? 0 : s.nextPush;
    e.lastPush = s.lastPush;
    e.end = s.end;
    e.terrain = s.terrain;
    e.robot = readRobot(e.world, handles, config, e.terrain);
    return e;
  }

  clone(): QuadrupedEnv {
    return this.restore(this.snapshot());
  }

  /** Frees the WebAssembly world. */
  dispose(): void {
    this.world?.free();
    this.world = null;
  }
}

/** Seeded pushes: first at U(pushFirst) s, then every U(pushEvery) s; uniform direction; magnitude U(0.5, 1)·pushImpulse. */
export function schedulePushes(seed: number, cfg: QuadrupedConfig): Push[] {
  if (cfg.pushImpulse <= 0) return [];
  const rng = Rng.stream(seed, 'quadruped-pushes');
  const uniform = ([a, b]: [number, number]) => a + (b - a) * rng.next();
  const pushes: Push[] = [];
  for (let t = uniform(cfg.pushFirst); t < cfg.duration; t += uniform(cfg.pushEvery)) {
    const angle = 2 * Math.PI * rng.next();
    const magnitude = (0.5 + 0.5 * rng.next()) * cfg.pushImpulse;
    pushes.push({ time: t, impulse: [magnitude * Math.cos(angle), 0, magnitude * Math.sin(angle)] });
  }
  return pushes;
}
