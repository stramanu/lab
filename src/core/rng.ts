/**
 * Deterministic PRNG: sfc32 seeded via splitmix32.
 * Named streams: each module derives its own stream from (seed, name),
 * so changing how many draws one module makes does not affect the others.
 */

export function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** 32-bit FNV-1a hash of a string. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    // Discard the first outputs to mix the state well.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  /** Creates an independent stream identified by a seed and a name. */
  static stream(seed: number, name: string): Rng {
    return new Rng((Math.imul(seed >>> 0, 0x9e3779b1) ^ hashString(name)) >>> 0);
  }

  /** Independent copy with the same internal state. */
  clone(): Rng {
    const r = Object.create(Rng.prototype) as Rng;
    r.a = this.a;
    r.b = this.b;
    r.c = this.c;
    r.d = this.d;
    return r;
  }

  nextUint32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t >>> 0;
  }

  /** Number in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Standard normal (Box-Muller). */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Shuffles in place (Fisher-Yates). */
  shuffle<T>(arr: T[] | Int32Array | Uint32Array): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp as never;
    }
  }
}
