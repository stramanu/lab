import type { TrainData } from '../nn/train';

/**
 * FNV-1a hash of the encoding, each value clamped to [0, 1] and quantized to 1/255. Encodings with values
 * outside [0, 1] (lander, warehouse) can collide, so distinct states may be rejected as duplicates:
 * measured on planner-driven training episodes, 0.3% of Snake states, 0.1% of lander states and 4.9% of
 * warehouse states. Kept as is so that the published studies stay reproducible (EXPERIMENTS.md, decision 33).
 */
export function hashEncoding(x: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    const q = Math.max(0, Math.min(255, Math.round(x[i] * 255)));
    h ^= q;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Fixed-capacity ring buffer of labeled states. When full, the oldest example
 * is overwritten. States whose encoding hash is already present are rejected.
 */
export class ReplayDataset implements TrainData {
  private xs: Float32Array;
  private ys: Float32Array;
  private masks: Uint8Array;
  private hashes: Uint32Array;
  private index = new Map<number, number>();
  private count = 0;
  private writePtr = 0;

  constructor(
    readonly capacity: number,
    readonly inputSize: number,
    readonly numActions: number,
  ) {
    this.xs = new Float32Array(capacity * inputSize);
    this.ys = new Float32Array(capacity * numActions);
    this.masks = new Uint8Array(capacity * numActions);
    this.hashes = new Uint32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Adds an example; returns false if it was a duplicate. */
  add(x: ArrayLike<number>, y: ArrayLike<number>, legal: ArrayLike<number | boolean>): boolean {
    const h = hashEncoding(x);
    if (this.index.has(h)) return false;
    const slot = this.writePtr;
    if (this.count === this.capacity) {
      const old = this.hashes[slot];
      if (this.index.get(old) === slot) this.index.delete(old);
    } else {
      this.count++;
    }
    for (let i = 0; i < this.inputSize; i++) this.xs[slot * this.inputSize + i] = x[i];
    for (let a = 0; a < this.numActions; a++) {
      this.ys[slot * this.numActions + a] = y[a];
      this.masks[slot * this.numActions + a] = legal[a] ? 1 : 0;
    }
    this.hashes[slot] = h;
    this.index.set(h, slot);
    this.writePtr = (slot + 1) % this.capacity;
    return true;
  }

  has(x: ArrayLike<number>): boolean {
    return this.index.has(hashEncoding(x));
  }

  x(i: number): Float32Array {
    return this.xs.subarray(i * this.inputSize, (i + 1) * this.inputSize);
  }

  y(i: number): Float32Array {
    return this.ys.subarray(i * this.numActions, (i + 1) * this.numActions);
  }

  legal(i: number): Uint8Array {
    return this.masks.subarray(i * this.numActions, (i + 1) * this.numActions);
  }
}
