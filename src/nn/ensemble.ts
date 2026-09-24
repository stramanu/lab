import { Rng } from '../core/rng';
import { Adam } from './adam';
import { Mlp } from './mlp';

export interface EnsembleConfig {
  inputSize: number;
  hidden: [number, number];
  /** Action dimensions and their bounds. */
  low: number[];
  high: number[];
  members: number;
  seed: number;
}

/** Monotone non-increasing map from disagreement to confidence (piecewise constant over bins). */
export interface ConfidenceMap {
  /** Upper edge of each disagreement bin, increasing. */
  edges: number[];
  /** Confidence for each bin, non-increasing. */
  values: number[];
}

export interface EnsembleDecision {
  /** Mean action, clamped to the bounds. */
  action: Float64Array;
  /** Mean over dimensions of the members' std, each divided by the dimension's range. */
  disagreement: number;
  confidence: number;
  /** One forward pass per member. */
  cost: number;
}

/** Before calibration: a simple decreasing default. */
const DEFAULT_MAP: ConfidenceMap = { edges: [0.02, 0.05, 0.1, 0.2], values: [0.95, 0.8, 0.6, 0.3] };

/**
 * Deep ensemble (Lakshminarayanan et al. 2017) of small MLP regressors. Each
 * member regresses the teacher's continuous action in normalized units
 * ([low, high] → [−1, 1]); the action is the clamped mean, and the members'
 * disagreement drives a calibrated confidence.
 */
export class Ensemble {
  readonly config: EnsembleConfig;
  readonly members: Mlp[];
  confidenceMap: ConfidenceMap = DEFAULT_MAP;
  private adams: Adam[];
  private rngs: Rng[];
  private grads: Float64Array[];

  constructor(config: EnsembleConfig) {
    this.config = config;
    const dim = config.low.length;
    this.members = Array.from({ length: config.members }, (_, k) => new Mlp({ inputSize: config.inputSize, hidden: config.hidden, outputSize: dim, seed: config.seed * 31 + k }));
    this.adams = this.members.map((m) => new Adam(m.numParams, { lr: 1e-3 }));
    this.rngs = this.members.map((_, k) => Rng.stream(config.seed * 31 + k, 'ensemble-shuffle'));
    this.grads = this.members.map((m) => new Float64Array(m.numParams));
  }

  get dim(): number {
    return this.config.low.length;
  }

  /** Action → normalized target in [−1, 1] per dimension. */
  normalize(action: ArrayLike<number>): Float32Array {
    const { low, high } = this.config;
    return Float32Array.from({ length: this.dim }, (_, d) => (2 * (action[d] - low[d])) / (high[d] - low[d]) - 1);
  }

  /** Raw normalized outputs of every member. */
  outputs(x: ArrayLike<number>): Float64Array[] {
    return this.members.map((m) => Float64Array.from(m.logits(x)));
  }

  decide(x: ArrayLike<number>): EnsembleDecision {
    const outs = this.outputs(x);
    const { low, high } = this.config;
    const K = outs.length;
    const action = new Float64Array(this.dim);
    let disagreement = 0;
    for (let d = 0; d < this.dim; d++) {
      let mean = 0;
      for (const o of outs) mean += o[d];
      mean /= K;
      let variance = 0;
      for (const o of outs) variance += (o[d] - mean) ** 2;
      // Std in normalized units spans a range of 2; divide by it to express it as a fraction of the range.
      disagreement += Math.sqrt(variance / K) / 2;
      const clamped = Math.max(-1, Math.min(1, mean));
      action[d] = low[d] + ((clamped + 1) / 2) * (high[d] - low[d]);
    }
    disagreement /= this.dim;
    return { action, disagreement, confidence: this.confidenceOf(disagreement), cost: K };
  }

  confidenceOf(disagreement: number): number {
    const { edges, values } = this.confidenceMap;
    for (let i = 0; i < edges.length; i++) if (disagreement <= edges[i]) return values[i];
    return values[values.length - 1];
  }

  /**
   * One pass of mini-batch MSE training for every member on (x, action) pairs.
   * Each member shuffles with its own stream. Returns the mean loss.
   */
  train(xs: Float32Array[], actions: ArrayLike<number>[], epochs = 1, batch = 64): number {
    const targets = actions.map((a) => this.normalize(a));
    let total = 0;
    let count = 0;
    this.members.forEach((_, k) => {
      const r = this.trainMember(k, xs, targets, epochs, batch);
      total += r.total;
      count += r.count;
    });
    return count ? total / count : NaN;
  }

  /**
   * Trains one member on normalized targets. Members are independent (own shuffle stream and
   * optimizer state), so they can be trained in separate threads with identical results.
   */
  trainMember(k: number, xs: Float32Array[], targets: Float32Array[], epochs = 1, batch = 64): { total: number; count: number } {
    const m = this.members[k];
    let total = 0;
    let count = 0;
    const order = Array.from({ length: xs.length }, (_, i) => i);
    for (let e = 0; e < epochs; e++) {
      this.rngs[k].shuffle(order);
      for (let s = 0; s < order.length; s += batch) {
        const idx = order.slice(s, s + batch);
        this.grads[k].fill(0);
        for (const i of idx) {
          total += m.accumulateMse(xs[i], targets[i], this.grads[k], 1 / idx.length);
          count++;
        }
        this.adams[k].step(m.params, this.grads[k]);
      }
    }
    return { total, count };
  }

  /** Mean squared error of the ensemble mean, in normalized units. */
  meanSquaredError(xs: Float32Array[], actions: ArrayLike<number>[]): number {
    let s = 0;
    xs.forEach((x, i) => {
      const t = this.normalize(actions[i]);
      const outs = this.outputs(x);
      for (let d = 0; d < this.dim; d++) {
        const mean = outs.reduce((a, o) => a + o[d], 0) / outs.length;
        s += (Math.max(-1, Math.min(1, mean)) - t[d]) ** 2 / this.dim;
      }
    });
    return s / Math.max(1, xs.length);
  }

  /**
   * Fits the confidence map on validation data: 10 quantile bins of disagreement,
   * the agreement rate per bin, then a running minimum so confidence never
   * increases with disagreement.
   */
  fitConfidence(xs: Float32Array[], actions: ArrayLike<number>[], agrees: (predicted: Float64Array, target: ArrayLike<number>) => boolean, bins = 10): ConfidenceMap {
    const rows = xs.map((x, i) => {
      const d = this.decide(x);
      return { disagreement: d.disagreement, agree: agrees(d.action, actions[i]) };
    });
    rows.sort((a, b) => a.disagreement - b.disagreement);
    const edges: number[] = [];
    const values: number[] = [];
    for (let b = 0; b < bins; b++) {
      const slice = rows.slice(Math.floor((b * rows.length) / bins), Math.floor(((b + 1) * rows.length) / bins));
      if (!slice.length) continue;
      edges.push(b === bins - 1 ? Infinity : slice[slice.length - 1].disagreement);
      const rate = slice.filter((r) => r.agree).length / slice.length;
      values.push(values.length ? Math.min(values[values.length - 1], rate) : rate);
    }
    this.confidenceMap = { edges, values };
    return this.confidenceMap;
  }
}

export interface SerializedEnsemble {
  format: 'systemone-ensemble';
  version: 1;
  config: EnsembleConfig;
  confidenceMap: ConfidenceMap;
  /** Base64 of each member's float32 parameters. */
  members: string[];
  meta?: Record<string, unknown>;
}

function toBase64(values: ArrayLike<number>): string {
  const bytes = new Uint8Array(Float32Array.from(values).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function exportEnsemble(e: Ensemble, meta?: Record<string, unknown>): SerializedEnsemble {
  const map = { edges: e.confidenceMap.edges.map((v) => (Number.isFinite(v) ? v : 1e9)), values: e.confidenceMap.values };
  return { format: 'systemone-ensemble', version: 1, config: e.config, confidenceMap: map, members: e.members.map((m) => toBase64(m.params)), ...(meta ? { meta } : {}) };
}

export function importEnsemble(data: SerializedEnsemble): Ensemble {
  if (data.format !== 'systemone-ensemble' || data.version !== 1) throw new Error('Unsupported ensemble format');
  const e = new Ensemble(data.config);
  data.members.forEach((b64, k) => e.members[k].params.set(fromBase64(b64)));
  e.confidenceMap = data.confidenceMap;
  return e;
}
