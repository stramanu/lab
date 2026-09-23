import { Rng } from '../../core/rng';
import type { ContinuousEnv, GameSummary, StepResult } from '../../core/types';
import { DEFAULT_RACING_CONFIG, GAS, MAX_STEER, RACING_ACTIONS, STEER_HOLD, action, pedalOf, type RacingConfig } from './config';
import { encodeRacing, RACING_ENCODING_SIZE } from './encoding';
import { commandTarget, copyCar, emptyCar, simulateControl, simulateDecision, type CarState } from './physics';
import { generateTrack, type Track } from './track';

/** Headless top-down racing on a procedural closed track. Deterministic given the seed. */
export class RacingEnv implements ContinuousEnv {
  readonly name = 'racing';
  readonly numActions = RACING_ACTIONS.length;
  readonly actionNames = RACING_ACTIONS;
  readonly encodingSize: number = RACING_ENCODING_SIZE;
  readonly defaultAction = action(STEER_HOLD, GAS);
  /** Continuous action: [steering target (rad), pedal (−1 brake … +1 gas)]. */
  readonly actionDim = 2;
  readonly actionLow = [-MAX_STEER, -1] as const;
  readonly actionHigh = [MAX_STEER, 1] as const;
  readonly config: RacingConfig;
  track: Track;
  readonly car: CarState = emptyCar();

  constructor(config: Partial<RacingConfig> = {}) {
    this.config = { ...DEFAULT_RACING_CONFIG, ...config };
    this.track = generateTrack(0, this.config);
  }

  static fromState(track: Track, car: Partial<CarState>, config: Partial<RacingConfig> = {}): RacingEnv {
    const env = new RacingEnv(config);
    env.track = track;
    Object.assign(env.car, emptyCar(), car);
    return env;
  }

  reset(seed: number): void {
    this.track = generateTrack(seed, this.config);
    const rng = Rng.stream(seed, 'racing-start');
    const i = rng.int(this.track.n);
    Object.assign(this.car, emptyCar(), {
      x: this.track.x[i],
      y: this.track.y[i],
      heading: Math.atan2(this.track.ty[i], this.track.tx[i]),
      speed: 5,
      index: i,
    });
  }

  step(a: number): StepResult {
    if (this.car.end) return { reward: 0, done: true, score: this.score() };
    const before = this.car.progress;
    simulateDecision(this.car, this.track, this.config, a);
    return { reward: this.car.progress - before, done: this.car.end !== null, score: this.score() };
  }

  stepContinuous(a: ArrayLike<number>): StepResult {
    if (this.car.end) return { reward: 0, done: true, score: this.score() };
    const before = this.car.progress;
    simulateControl(this.car, this.track, this.config, a[0], a[1]);
    return { reward: this.car.progress - before, done: this.car.end !== null, score: this.score() };
  }

  continuousOf(a: number): Float64Array {
    return Float64Array.of(commandTarget(this.car, a), pedalOf(a) === GAS ? 1 : -1);
  }

  legalActions(): boolean[] {
    return new Array(this.numActions).fill(true);
  }

  encode(out?: Float32Array): Float32Array {
    return encodeRacing(this.car, this.track, this.config, out);
  }

  isDone(): boolean {
    return this.car.end !== null;
  }

  score(): number {
    return Math.max(0, this.car.progress);
  }

  summary(): GameSummary {
    return {
      score: this.score(),
      steps: this.car.decisions,
      endReason: this.car.end ?? 'running',
      metrics: {
        laps: this.car.progress / this.track.length,
        meanSpeed: this.car.time > 0 ? this.car.progress / this.car.time : 0,
        finished: this.car.end === 'timeout' ? 1 : 0,
      },
    };
  }

  render(): string {
    const c = this.car;
    return `progress=${c.progress.toFixed(1)}m speed=${c.speed.toFixed(1)}m/s steer=${c.steer.toFixed(2)} t=${c.time.toFixed(1)}s end=${c.end ?? 'racing'} track=${this.track.length.toFixed(0)}m`;
  }

  clone(): RacingEnv {
    const e = new RacingEnv(this.config);
    e.track = this.track;
    copyCar(this.car, e.car);
    return e;
  }
}
