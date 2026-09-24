import type { TrainData } from '../nn/train';

/** FNV-1a hash of the encoding's float32 bit patterns: equal encodings give equal hashes. */
export function hashEncoding(x: ArrayLike<number>): number {
  const f = new Float32Array(1);
  const bits = new Uint32Array(f.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    f[0] = x[i];
    h ^= bits[0];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Fixed-capacity ring buffer of labeled states. When full, the oldest example
 * is overwritten. A state is rejected only if an identical encoding (as float32) is already present;
 * the hash only narrows the comparison.
 */
export class ReplayDataset implements TrainData {
  private xs: Float32Array;
  private ys: Float32Array;
  private masks: Uint8Array;
  private hashes: Uint32Array;
  private index = new Map<number, number[]>();
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
    if (this.find(x, h) >= 0) return false;
    const slot = this.writePtr;
    if (this.count === this.capacity) {
      const old = this.hashes[slot];
      const slots = this.index.get(old)!;
      slots.splice(slots.indexOf(slot), 1);
      if (!slots.length) this.index.delete(old);
    } else {
      this.count++;
    }
    for (let i = 0; i < this.inputSize; i++) this.xs[slot * this.inputSize + i] = x[i];
    for (let a = 0; a < this.numActions; a++) {
      this.ys[slot * this.numActions + a] = y[a];
      this.masks[slot * this.numActions + a] = legal[a] ? 1 : 0;
    }
    this.hashes[slot] = h;
    const slots = this.index.get(h);
    if (slots) slots.push(slot);
    else this.index.set(h, [slot]);
    this.writePtr = (slot + 1) % this.capacity;
    return true;
  }

  has(x: ArrayLike<number>): boolean {
    return this.find(x, hashEncoding(x)) >= 0;
  }

  /** Slot holding an encoding identical to `x` (compared as float32), or −1. */
  private find(x: ArrayLike<number>, h: number): number {
    const slots = this.index.get(h);
    if (!slots) return -1;
    for (const slot of slots) {
      let same = true;
      for (let i = 0; i < this.inputSize && same; i++) same = this.xs[slot * this.inputSize + i] === Math.fround(x[i]);
      if (same) return slot;
    }
    return -1;
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
