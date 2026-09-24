import { Rng } from '../../core/rng';
import type { Env, GameSummary, StepResult } from '../../core/types';
import { DEFAULT_WAREHOUSE_CONFIG, DX, DY, WAIT, WAREHOUSE_ACTIONS, type WarehouseConfig } from './config';
import { encodeWarehouse, WAREHOUSE_ENCODING_SIZE } from './encoding';
import { distanceMap, makeLayout, walkable, type Layout } from './layout';

/**
 * Lifelong multi-robot warehouse (MAPF in real time). One decision per robot
 * per timestep, in an order that rotates each timestep; robots that decided
 * claim their next cell. Blocked moves (shelf, claimed cell, undecided
 * occupant, swap) make the robot wait and count as collisions.
 */
export class WarehouseEnv implements Env {
  readonly name = 'warehouse';
  readonly numActions = 5;
  readonly actionNames = WAREHOUSE_ACTIONS;
  readonly encodingSize: number = WAREHOUSE_ENCODING_SIZE;
  readonly defaultAction = WAIT;
  readonly config: WarehouseConfig;
  readonly layout: Layout;
  readonly n: number;
  pos: Int32Array;
  next: Int32Array;
  goal: Int32Array;
  /** 0 = heading to a shelf, 1 = heading to a station. */
  goalKind: Uint8Array;
  decided: Uint8Array;
  /** robot index + 1 of the occupant (current positions). */
  occ: Int16Array;
  /** robot index + 1 that claimed the cell for the next timestep. */
  claimed: Int16Array;
  t = 0;
  turn = 0;
  start = 0;
  deliveries = 0;
  collisions = 0;
  waits = 0;
  decisions = 0;
  private rng: Rng = new Rng(0);

  constructor(config: Partial<WarehouseConfig> = {}) {
    this.config = { ...DEFAULT_WAREHOUSE_CONFIG, ...config };
    this.layout = makeLayout(this.config);
    this.n = this.config.robots;
    const cells = this.layout.width * this.layout.height;
    this.pos = new Int32Array(this.n);
    this.next = new Int32Array(this.n);
    this.goal = new Int32Array(this.n);
    this.goalKind = new Uint8Array(this.n);
    this.decided = new Uint8Array(this.n);
    this.occ = new Int16Array(cells);
    this.claimed = new Int16Array(cells);
  }

  /** The robot whose decision is next. */
  get current(): number {
    return (this.start + this.turn) % this.n;
  }

  reset(seed: number): void {
    this.rng = Rng.stream(seed, 'warehouse');
    this.occ.fill(0);
    this.claimed.fill(0);
    this.decided.fill(0);
    this.t = 0;
    this.turn = 0;
    this.start = 0;
    this.deliveries = 0;
    this.collisions = 0;
    this.waits = 0;
    this.decisions = 0;
    const free: number[] = [];
    for (let c = 0; c < this.occ.length; c++) if (!this.layout.blocked[c] && !this.layout.stations.includes(c)) free.push(c);
    this.rng.shuffle(free);
    for (let r = 0; r < this.n; r++) {
      this.pos[r] = free[r];
      this.next[r] = free[r];
      this.occ[free[r]] = r + 1;
      this.goalKind[r] = 1; // the first assigned goal will be a shelf
      this.assignGoal(r);
    }
  }

  /** Alternates shelf-access cells and stations; never the robot's own cell. */
  private assignGoal(r: number): void {
    this.goalKind[r] ^= 1;
    const pool = this.goalKind[r] === 0 ? this.layout.shelfAccess : this.layout.stations;
    let g = pool[this.rng.int(pool.length)];
    while (g === this.pos[r]) g = pool[this.rng.int(pool.length)];
    this.goal[r] = g;
  }

  /** Target cell of `action` for robot r, and whether the environment would block it. */
  resolve(r: number, action: number): { target: number; blocked: boolean } {
    const W = this.layout.width;
    const from = this.pos[r];
    if (action === WAIT) return { target: from, blocked: false };
    const x = (from % W) + DX[action];
    const y = ((from / W) | 0) + DY[action];
    if (!walkable(this.layout, x, y)) return { target: from, blocked: true };
    const target = y * W + x;
    if (this.claimed[target]) return { target: from, blocked: true };
    const other = this.occ[target] - 1;
    if (other >= 0) {
      // An undecided occupant may stay: blocked. A decided one moving into our cell: swap.
      if (!this.decided[other]) return { target: from, blocked: true };
      if (this.next[other] === from) return { target: from, blocked: true };
    }
    return { target, blocked: false };
  }

  step(action: number): StepResult {
    if (this.isDone()) return { reward: 0, done: true, score: this.deliveries };
    const r = this.current;
    const { target, blocked } = this.resolve(r, action);
    if (blocked) this.collisions++;
    if (target === this.pos[r]) this.waits++;
    this.next[r] = target;
    this.claimed[target] = r + 1;
    this.decided[r] = 1;
    this.decisions++;
    this.turn++;
    let reward = 0;
    if (this.turn === this.n) reward = this.commit();
    return { reward, done: this.isDone(), score: this.deliveries };
  }

  /** Ends the timestep: everyone moves, deliveries are counted, the order rotates. */
  private commit(): number {
    let delivered = 0;
    this.occ.fill(0);
    for (let r = 0; r < this.n; r++) {
      this.pos[r] = this.next[r];
      this.occ[this.pos[r]] = r + 1;
    }
    for (let r = 0; r < this.n; r++) {
      if (this.pos[r] === this.goal[r]) {
        delivered++;
        this.assignGoal(r);
      }
    }
    this.deliveries += delivered;
    this.claimed.fill(0);
    this.decided.fill(0);
    this.turn = 0;
    this.start = (this.start + 1) % this.n;
    this.t++;
    return delivered;
  }

  /** Distance-to-goal map of robot r. */
  distances(r: number): Int16Array {
    return distanceMap(this.layout, this.goal[r]);
  }

  legalActions(): boolean[] {
    return [true, true, true, true, true];
  }

  encode(out?: Float32Array): Float32Array {
    return encodeWarehouse(this, out);
  }

  isDone(): boolean {
    return this.t >= this.config.timesteps;
  }

  score(): number {
    return this.deliveries;
  }

  summary(): GameSummary {
    return {
      score: this.deliveries,
      steps: this.decisions,
      endReason: 'timeout',
      metrics: { deliveries: this.deliveries, collisions: this.collisions, waitShare: this.decisions ? this.waits / this.decisions : 0 },
    };
  }

  render(): string {
    const { width: W, height: H } = this.layout;
    const rows: string[] = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const c = y * W + x;
        const o = this.occ[c];
        row += o ? String.fromCharCode(96 + ((o - 1) % 26) + 1) : this.layout.blocked[c] ? '#' : this.layout.stations.includes(c) ? 'S' : '.';
      }
      rows.push(row);
    }
    return rows.join('\n') + `\nt=${this.t} deliveries=${this.deliveries} collisions=${this.collisions}`;
  }

  clone(): WarehouseEnv {
    const e = new WarehouseEnv(this.config);
    e.pos.set(this.pos);
    e.next.set(this.next);
    e.goal.set(this.goal);
    e.goalKind.set(this.goalKind);
    e.decided.set(this.decided);
    e.occ.set(this.occ);
    e.claimed.set(this.claimed);
    e.t = this.t;
    e.turn = this.turn;
    e.start = this.start;
    e.deliveries = this.deliveries;
    e.collisions = this.collisions;
    e.waits = this.waits;
    e.decisions = this.decisions;
    e.rng = this.rng.clone();
    return e;
  }
}
