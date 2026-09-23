import { Rng } from '../core/rng';
import { argmax } from '../core/types';
import { Adam, type AdamConfig } from './adam';
import { crossEntropy } from './math';
import type { Mlp } from './mlp';

/** Labeled examples: input encoding, soft-label target and legality mask. */
export interface TrainData {
  readonly size: number;
  x(i: number): Float32Array;
  y(i: number): Float32Array;
  legal(i: number): Uint8Array;
}

/** Simple in-memory TrainData backed by arrays (tests, validation splits). */
export class ArrayTrainData implements TrainData {
  constructor(
    private readonly xs: Float32Array[],
    private readonly ys: Float32Array[],
    private readonly masks: Uint8Array[],
  ) {}

  get size(): number {
    return this.xs.length;
  }

  x(i: number): Float32Array {
    return this.xs[i];
  }

  y(i: number): Float32Array {
    return this.ys[i];
  }

  legal(i: number): Uint8Array {
    return this.masks[i];
  }
}

export interface TrainOptions {
  batchSize: number;
  /** Number of passes over the data. Ignored if `steps` is set. */
  epochs: number;
  /** Fixed number of mini-batch steps sampled from the data (without replacement per pass). */
  steps?: number;
  seed: number;
}

export const DEFAULT_TRAIN: TrainOptions = { batchSize: 64, epochs: 1, seed: 0 };

/**
 * Mini-batch trainer. Keeps its own Adam state and shuffle stream so repeated
 * calls continue the same optimization deterministically.
 */
export class Trainer {
  readonly adam: Adam;
  private grad: Float64Array;
  private rng: Rng;
  private order: Int32Array = new Int32Array(0);
  private cursor = 0;

  constructor(
    readonly net: Mlp,
    adam: Partial<AdamConfig> = {},
    seed = 0,
  ) {
    this.adam = new Adam(net.numParams, adam);
    this.grad = new Float64Array(net.numParams);
    this.rng = Rng.stream(seed, 'trainer-shuffle');
  }

  private nextIndex(size: number): number {
    if (this.order.length !== size || this.cursor >= size) {
      if (this.order.length !== size) this.order = Int32Array.from({ length: size }, (_, i) => i);
      this.rng.shuffle(this.order);
      this.cursor = 0;
    }
    return this.order[this.cursor++];
  }

  /** Runs training; returns the mean training loss over the processed samples. */
  train(data: TrainData, options: Partial<TrainOptions> = {}): number {
    const opts = { ...DEFAULT_TRAIN, ...options };
    if (data.size === 0) return NaN;
    const batch = Math.min(opts.batchSize, data.size);
    const steps = opts.steps ?? Math.ceil((opts.epochs * data.size) / batch);
    let total = 0;
    let count = 0;
    for (let s = 0; s < steps; s++) {
      this.grad.fill(0);
      for (let b = 0; b < batch; b++) {
        const i = this.nextIndex(data.size);
        total += this.net.accumulateGradient(data.x(i), data.y(i), data.legal(i), this.grad, 1 / batch);
        count++;
      }
      this.adam.step(this.net.params, this.grad);
    }
    return total / count;
  }
}

export interface EvalResult {
  /** Mean soft-label cross-entropy. */
  loss: number;
  /** Fraction of examples where the network argmax equals the target argmax. */
  agreement: number;
}

export function evaluate(net: Mlp, data: TrainData, temperature = 1): EvalResult {
  if (data.size === 0) return { loss: NaN, agreement: NaN };
  let loss = 0;
  let agree = 0;
  const probs = new Float32Array(net.config.outputSize);
  for (let i = 0; i < data.size; i++) {
    const legal = data.legal(i);
    net.probs(data.x(i), legal, temperature, probs);
    loss += crossEntropy(data.y(i), probs);
    const legalBool = Array.from(legal, Boolean);
    if (argmax(probs, legalBool) === argmax(data.y(i), legalBool)) agree++;
  }
  return { loss: loss / data.size, agreement: agree / data.size };
}
