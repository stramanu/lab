import { Rng } from '../core/rng';
import { maskedSoftmax } from './math';

export interface MlpConfig {
  inputSize: number;
  hidden: [number, number];
  outputSize: number;
  seed: number;
}

export type Precision = 'f32' | 'f64';
export type ParamBuffer = Float32Array | Float64Array;

/**
 * Two-hidden-layer ReLU MLP with one logit per action, written from scratch.
 * All parameters live in one flat buffer: [W1, b1, W2, b2, W3, b3], with
 * W stored row-major per output unit (W[j * in + i]).
 * Precision is f32 for real use and f64 only for gradient checking.
 */
export class Mlp {
  readonly config: MlpConfig;
  readonly precision: Precision;
  readonly params: ParamBuffer;
  readonly numParams: number;
  /** Offsets of each tensor inside `params`. */
  readonly offsets: { w1: number; b1: number; w2: number; b2: number; w3: number; b3: number };

  // Per-sample activation buffers (reused).
  private z1: Float64Array;
  private a1: Float64Array;
  private z2: Float64Array;
  private a2: Float64Array;
  private logitsBuf: Float64Array;
  private dz1: Float64Array;
  private dz2: Float64Array;
  private dz3: Float64Array;

  constructor(config: MlpConfig, precision: Precision = 'f32') {
    this.config = config;
    this.precision = precision;
    const { inputSize: n0, hidden: [n1, n2], outputSize: n3 } = config;
    const w1 = 0;
    const b1 = w1 + n0 * n1;
    const w2 = b1 + n1;
    const b2 = w2 + n1 * n2;
    const w3 = b2 + n2;
    const b3 = w3 + n2 * n3;
    this.offsets = { w1, b1, w2, b2, w3, b3 };
    this.numParams = b3 + n3;
    this.params = precision === 'f32' ? new Float32Array(this.numParams) : new Float64Array(this.numParams);
    this.z1 = new Float64Array(n1);
    this.a1 = new Float64Array(n1);
    this.z2 = new Float64Array(n2);
    this.a2 = new Float64Array(n2);
    this.logitsBuf = new Float64Array(n3);
    this.dz1 = new Float64Array(n1);
    this.dz2 = new Float64Array(n2);
    this.dz3 = new Float64Array(n3);
    this.init();
  }

  /** Deterministic He initialization; biases start at zero. */
  private init(): void {
    const rng = Rng.stream(this.config.seed, 'mlp-init');
    const { inputSize: n0, hidden: [n1, n2], outputSize: n3 } = this.config;
    const fill = (offset: number, fanIn: number, count: number) => {
      const s = Math.sqrt(2 / fanIn);
      for (let k = 0; k < count; k++) this.params[offset + k] = rng.normal() * s;
    };
    fill(this.offsets.w1, n0, n0 * n1);
    fill(this.offsets.w2, n1, n1 * n2);
    fill(this.offsets.w3, n2, n2 * n3);
  }

  /** Forward pass; returns the internal logits buffer (valid until the next call). */
  logits(x: ArrayLike<number>): Float64Array {
    const p = this.params;
    const { inputSize: n0, hidden: [n1, n2], outputSize: n3 } = this.config;
    const { w1, b1, w2, b2, w3, b3 } = this.offsets;
    const { z1, a1, z2, a2, logitsBuf } = this;

    for (let j = 0; j < n1; j++) z1[j] = p[b1 + j];
    // Inputs are mostly one-hot zeros: iterate inputs outermost and skip zeros.
    for (let i = 0; i < n0; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      for (let j = 0; j < n1; j++) z1[j] += p[w1 + j * n0 + i] * xi;
    }
    for (let j = 0; j < n1; j++) a1[j] = z1[j] > 0 ? z1[j] : 0;

    for (let j = 0; j < n2; j++) {
      let s = p[b2 + j];
      const row = w2 + j * n1;
      for (let i = 0; i < n1; i++) s += p[row + i] * a1[i];
      z2[j] = s;
      a2[j] = s > 0 ? s : 0;
    }

    for (let k = 0; k < n3; k++) {
      let s = p[b3 + k];
      const row = w3 + k * n2;
      for (let j = 0; j < n2; j++) s += p[row + j] * a2[j];
      logitsBuf[k] = s;
    }
    return logitsBuf;
  }

  /**
   * Activations of every layer for one input (copies): input, hidden layers after
   * ReLU and output logits, from the same forward pass as `logits` / `probs`.
   */
  trace(x: ArrayLike<number>): { input: Float64Array; h1: Float64Array; h2: Float64Array; logits: Float64Array } {
    const logits = Float64Array.from(this.logits(x));
    return { input: Float64Array.from(x), h1: Float64Array.from(this.a1), h2: Float64Array.from(this.a2), logits };
  }

  /** Masked policy probabilities at the given temperature. */
  probs(x: ArrayLike<number>, legal: ArrayLike<number | boolean> | null, temperature = 1, out?: Float32Array): Float32Array {
    const o = out ?? new Float32Array(this.config.outputSize);
    maskedSoftmax(this.logits(x), legal, temperature, o);
    return o;
  }

  /**
   * Forward + backward for one sample with soft-label cross-entropy.
   * Accumulates `scale * dLoss/dParams` into `grad` and returns the loss.
   */
  accumulateGradient(
    x: ArrayLike<number>,
    target: ArrayLike<number>,
    legal: ArrayLike<number | boolean> | null,
    grad: Float64Array,
    scale: number,
  ): number {
    const n3 = this.config.outputSize;
    const logits = this.logits(x);
    const dz3 = this.dz3;
    maskedSoftmax(logits, legal, 1, dz3);
    let loss = 0;
    for (let k = 0; k < n3; k++) {
      if (target[k] > 0) loss -= target[k] * Math.log(Math.max(dz3[k], 1e-300));
      dz3[k] -= target[k]; // dL/dlogit = p - y (both zero on masked actions)
    }
    this.backward(x, grad, scale);
    return loss;
  }

  /**
   * Forward + backward for one sample with mean-squared error on the raw
   * outputs, L = ½ · mean_k (out_k − target_k)². Returns the loss.
   */
  accumulateMse(x: ArrayLike<number>, target: ArrayLike<number>, grad: Float64Array, scale: number): number {
    const n3 = this.config.outputSize;
    const out = this.logits(x);
    let loss = 0;
    for (let k = 0; k < n3; k++) {
      const e = out[k] - target[k];
      loss += (0.5 * e * e) / n3;
      this.dz3[k] = e / n3;
    }
    this.backward(x, grad, scale);
    return loss;
  }

  /** Backpropagates `dz3` (dLoss/dOutput, from the last forward pass) into `grad`. */
  private backward(x: ArrayLike<number>, grad: Float64Array, scale: number): void {
    const p = this.params;
    const { inputSize: n0, hidden: [n1, n2], outputSize: n3 } = this.config;
    const { w1, b1, w2, b2, w3 } = this.offsets;
    const b3 = this.offsets.b3;
    const { z1, a1, z2, a2, dz1, dz2, dz3 } = this;

    for (let k = 0; k < n3; k++) {
      const g = dz3[k] * scale;
      if (g === 0) continue;
      grad[b3 + k] += g;
      const row = w3 + k * n2;
      for (let j = 0; j < n2; j++) grad[row + j] += g * a2[j];
    }

    for (let j = 0; j < n2; j++) {
      if (z2[j] <= 0) {
        dz2[j] = 0;
        continue;
      }
      let s = 0;
      for (let k = 0; k < n3; k++) s += p[w3 + k * n2 + j] * dz3[k];
      dz2[j] = s;
    }
    for (let j = 0; j < n2; j++) {
      const g = dz2[j] * scale;
      if (g === 0) continue;
      grad[b2 + j] += g;
      const row = w2 + j * n1;
      for (let i = 0; i < n1; i++) grad[row + i] += g * a1[i];
    }

    for (let i = 0; i < n1; i++) dz1[i] = 0;
    for (let j = 0; j < n2; j++) {
      const d = dz2[j];
      if (d === 0) continue;
      const row = w2 + j * n1;
      for (let i = 0; i < n1; i++) dz1[i] += p[row + i] * d;
    }
    for (let i = 0; i < n1; i++) if (z1[i] <= 0) dz1[i] = 0;
    for (let j = 0; j < n1; j++) {
      const g = dz1[j] * scale;
      if (g === 0) continue;
      grad[b1 + j] += g;
    }
    for (let i = 0; i < n0; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      for (let j = 0; j < n1; j++) grad[w1 + j * n0 + i] += dz1[j] * scale * xi;
    }
  }
}
