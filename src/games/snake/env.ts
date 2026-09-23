import { Rng } from '../../core/rng';
import type { Env, GameSummary, StepResult } from '../../core/types';
import {
  DEFAULT_SNAKE_CONFIG,
  DX,
  DY,
  SNAKE_ACTIONS,
  STRAIGHT,
  turn,
  type SnakeConfig,
  type SnakeEndReason,
} from './config';
import { encodeSnake, SNAKE_ENCODING_SIZE } from './encoding';

export interface SnakeStateInit {
  /** Body cells as [x, y], from tail to head. */
  body: Array<[number, number]>;
  heading: number;
  food: [number, number] | null;
  seed?: number;
}

/**
 * Headless, deterministic Snake. The body is a ring buffer of cell indices
 * (tail first), with an occupancy grid for O(1) collision checks.
 */
export class SnakeEnv implements Env {
  readonly name = 'snake';
  readonly numActions = 3;
  readonly actionNames = SNAKE_ACTIONS;
  readonly encodingSize = SNAKE_ENCODING_SIZE;
  readonly defaultAction = STRAIGHT;

  readonly config: SnakeConfig;
  readonly width: number;
  readonly height: number;
  readonly cells: number;

  /** 1 where the snake body occupies the cell. */
  occ: Uint8Array;
  private ring: Int32Array;
  private tailPtr = 0;
  length = 0;
  heading = 0;
  food = -1;
  steps = 0;
  eaten = 0;
  stepsSinceFood = 0;
  endReason: SnakeEndReason | null = null;
  private rng: Rng;

  constructor(config: Partial<SnakeConfig> = {}) {
    this.config = { ...DEFAULT_SNAKE_CONFIG, ...config };
    this.width = this.config.width;
    this.height = this.config.height;
    this.cells = this.width * this.height;
    this.occ = new Uint8Array(this.cells);
    this.ring = new Int32Array(this.cells);
    this.rng = new Rng(0);
  }

  /** Builds an environment from a hand-made state (used by tests and tools). */
  static fromState(init: SnakeStateInit, config: Partial<SnakeConfig> = {}): SnakeEnv {
    const env = new SnakeEnv(config);
    env.rng = Rng.stream(init.seed ?? 0, 'snake-env');
    env.clearState();
    for (const [x, y] of init.body) env.pushHead(env.index(x, y));
    env.heading = init.heading;
    env.food = init.food ? env.index(init.food[0], init.food[1]) : -1;
    return env;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  x(i: number): number {
    return i % this.width;
  }

  y(i: number): number {
    return (i / this.width) | 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  head(): number {
    return this.ring[(this.tailPtr + this.length - 1) % this.cells];
  }

  tail(): number {
    return this.ring[this.tailPtr];
  }

  /** Body cells from tail to head. */
  body(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.length; i++) out.push(this.ring[(this.tailPtr + i) % this.cells]);
    return out;
  }

  reset(seed: number): void {
    this.rng = Rng.stream(seed, 'snake-env');
    this.clearState();
    this.heading = this.rng.int(4);
    const cx = this.width >> 1;
    const cy = this.height >> 1;
    // Body extends behind the head, opposite to the heading.
    for (let k = this.config.initialLength - 1; k >= 0; k--) {
      this.pushHead(this.index(cx - DX[this.heading] * k, cy - DY[this.heading] * k));
    }
    this.placeFood();
  }

  private clearState(): void {
    this.occ.fill(0);
    this.tailPtr = 0;
    this.length = 0;
    this.steps = 0;
    this.eaten = 0;
    this.stepsSinceFood = 0;
    this.endReason = null;
    this.food = -1;
  }

  private pushHead(cell: number): void {
    this.ring[(this.tailPtr + this.length) % this.cells] = cell;
    this.length++;
    this.occ[cell] = 1;
  }

  private popTail(): void {
    this.occ[this.ring[this.tailPtr]] = 0;
    this.tailPtr = (this.tailPtr + 1) % this.cells;
    this.length--;
  }

  private placeFood(): void {
    const free = this.cells - this.length;
    if (free <= 0) {
      this.food = -1;
      return;
    }
    let k = this.rng.int(free);
    for (let i = 0; i < this.cells; i++) {
      if (this.occ[i]) continue;
      if (k === 0) {
        this.food = i;
        return;
      }
      k--;
    }
  }

  step(action: number): StepResult {
    if (this.endReason) return { reward: 0, done: true, score: this.eaten };
    this.heading = turn(this.heading, action);
    const h = this.head();
    const nx = this.x(h) + DX[this.heading];
    const ny = this.y(h) + DY[this.heading];
    this.steps++;

    if (!this.inBounds(nx, ny)) return this.die('wall');
    const next = this.index(nx, ny);
    const eats = next === this.food;
    // The tail cell is vacated this step unless the snake eats.
    if (this.occ[next] && !(next === this.tail() && !eats)) return this.die('body');

    if (!eats) this.popTail();
    this.pushHead(next);

    if (eats) {
      this.eaten++;
      this.stepsSinceFood = 0;
      if (this.length === this.cells) {
        this.food = -1;
        this.endReason = 'win';
        return { reward: 1, done: true, score: this.eaten };
      }
      this.placeFood();
      return { reward: 1, done: false, score: this.eaten };
    }

    this.stepsSinceFood++;
    if (this.stepsSinceFood > this.config.starvationLimit) return this.die('starvation');
    return { reward: 0, done: false, score: this.eaten };
  }

  private die(reason: SnakeEndReason): StepResult {
    this.endReason = reason;
    return { reward: -1, done: true, score: this.eaten };
  }

  legalActions(): boolean[] {
    return [true, true, true];
  }

  encode(out?: Float32Array): Float32Array {
    return encodeSnake(this, out);
  }

  isDone(): boolean {
    return this.endReason !== null;
  }

  score(): number {
    return this.eaten;
  }

  summary(): GameSummary {
    return {
      score: this.eaten,
      steps: this.steps,
      endReason: this.endReason ?? 'running',
      metrics: {
        length: this.length,
        movesPerFood: this.eaten > 0 ? this.steps / this.eaten : this.steps,
      },
    };
  }

  render(): string {
    const headChars = ['^', '>', 'v', '<'];
    const h = this.length > 0 ? this.head() : -1;
    const border = '#'.repeat(this.width + 2);
    const rows = [border];
    for (let y = 0; y < this.height; y++) {
      let row = '#';
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        if (i === h) row += headChars[this.heading];
        else if (this.occ[i]) row += 'o';
        else if (i === this.food) row += '*';
        else row += '.';
      }
      rows.push(row + '#');
    }
    rows.push(border);
    return rows.join('\n');
  }

  clone(): SnakeEnv {
    const c = new SnakeEnv(this.config);
    c.occ.set(this.occ);
    c.ring.set(this.ring);
    c.tailPtr = this.tailPtr;
    c.length = this.length;
    c.heading = this.heading;
    c.food = this.food;
    c.steps = this.steps;
    c.eaten = this.eaten;
    c.stepsSinceFood = this.stepsSinceFood;
    c.endReason = this.endReason;
    c.rng = this.rng.clone();
    return c;
  }
}
