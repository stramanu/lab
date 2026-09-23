import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic given the seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('different seeds produce different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 10 }, () => a.nextUint32());
    const sb = Array.from({ length: 10 }, () => b.nextUint32());
    expect(sa).not.toEqual(sb);
  });

  it('named streams are independent and reproducible', () => {
    const env1 = Rng.stream(7, 'env');
    const net1 = Rng.stream(7, 'net');
    expect(env1.nextUint32()).not.toBe(net1.nextUint32());
    expect(Rng.stream(7, 'env').next()).toBe(Rng.stream(7, 'env').next());
  });

  it('distribution is roughly uniform', () => {
    const r = new Rng(123);
    const bins = new Array(10).fill(0);
    const n = 100_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      bins[Math.floor(x * 10)]++;
      sum += x;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    for (const b of bins) expect(Math.abs(b - n / 10)).toBeLessThan(n / 100);
  });

  it('int stays in range and shuffle is a permutation', () => {
    const r = new Rng(9);
    for (let i = 0; i < 1000; i++) {
      const k = r.int(3);
      expect(k === 0 || k === 1 || k === 2).toBe(true);
    }
    const arr = Array.from({ length: 50 }, (_, i) => i);
    r.shuffle(arr);
    expect([...arr].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });
});
