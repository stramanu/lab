import { Rng } from '../../core/rng';
import type { Env, GameSummary, StepResult } from '../../core/types';
import { DEFAULT_LANDER_CONFIG, LANDER_ACTIONS, NONE, type LanderConfig } from './config';
import { encodeLander, LANDER_ENCODING_SIZE } from './encoding';
import { copyState, emptyState, simulateDecision, type ShipState } from './physics';
import { generateWorld, padCenter, type World } from './world';

/** Headless 2D lander. Deterministic given the seed; the world is shared by clones. */
export class LanderEnv implements Env {
  readonly name = 'lander';
  readonly numActions = 4;
  readonly actionNames = LANDER_ACTIONS;
  readonly encodingSize = LANDER_ENCODING_SIZE;
  readonly defaultAction = NONE;
  readonly config: LanderConfig;
  world: World;
  readonly state: ShipState = emptyState();

  constructor(config: Partial<LanderConfig> = {}) {
    this.config = { ...DEFAULT_LANDER_CONFIG, ...config };
    this.world = generateWorld(0, this.config);
  }

  /** Builds an environment from an explicit world and ship state (tests, tools). */
  static fromState(world: World, state: Partial<ShipState>, config: Partial<LanderConfig> = {}): LanderEnv {
    const env = new LanderEnv(config);
    env.world = world;
    Object.assign(env.state, emptyState(), { fuel: env.config.fuel }, state);
    return env;
  }

  reset(seed: number): void {
    this.world = generateWorld(seed, this.config);
    const rng = Rng.stream(seed, 'lander-start');
    Object.assign(this.state, emptyState(), {
      x: 10 + 80 * rng.next(),
      y: 55 + 10 * rng.next(),
      vx: (rng.next() * 2 - 1) * 3,
      vy: -rng.next(),
      angle: (rng.next() * 2 - 1) * 0.2,
      fuel: this.config.fuel,
    });
  }

  step(action: number): StepResult {
    if (this.state.end) return { reward: 0, done: true, score: this.score() };
    simulateDecision(this.state, this.world, this.config, action);
    const done = this.state.end !== null;
    return { reward: done ? this.score() : 0, done, score: this.score() };
  }

  legalActions(): boolean[] {
    return [true, true, true, true];
  }

  encode(out?: Float32Array): Float32Array {
    return encodeLander(this.state, this.world, this.config, out);
  }

  isDone(): boolean {
    return this.state.end !== null;
  }

  score(): number {
    return this.state.end === 'landed' ? 100 + 50 * (this.state.fuel / this.config.fuel) : 0;
  }

  summary(): GameSummary {
    const s = this.state;
    return {
      score: this.score(),
      steps: s.decisions,
      endReason: s.end ?? 'running',
      metrics: {
        landed: s.end === 'landed' ? 1 : 0,
        fuelUsed: this.config.fuel - s.fuel,
        impactSpeed: s.impactSpeed,
        flightTime: s.time,
      },
    };
  }

  render(): string {
    const s = this.state;
    const f = (v: number) => v.toFixed(2);
    return [
      `x=${f(s.x)} y=${f(s.y)} vx=${f(s.vx)} vy=${f(s.vy)} angle=${f(s.angle)} omega=${f(s.omega)} fuel=${f(s.fuel)} t=${f(s.time)}`,
      `pad=[${f(this.world.padX0)}, ${f(this.world.padX1)}] @ y=${f(this.world.padY)} (center ${f(padCenter(this.world))}) wind0=${f(this.world.wind0)}`,
      `end=${s.end ?? 'flying'}`,
    ].join('\n');
  }

  clone(): LanderEnv {
    const c = new LanderEnv(this.config);
    c.world = this.world;
    copyState(this.state, c.state);
    return c;
  }
}
