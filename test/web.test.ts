import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EvalReport } from '../src/eval';
import { formatTick, linearScale, logScale, niceTicks } from '../web/charts';
import { costDomain, frontierPoints } from '../web/frontier';

describe('chart scales', () => {
  it('linear scale maps the domain onto the range', () => {
    const s = linearScale(0, 10, 100, 0);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
    expect(s(5)).toBe(50);
  });

  it('log scale maps decades evenly and ticks at powers of ten', () => {
    const s = logScale(1, 1000, 0, 300);
    expect(s(1)).toBeCloseTo(0);
    expect(s(10)).toBeCloseTo(100);
    expect(s(1000)).toBeCloseTo(300);
    expect(s.ticks).toEqual([1, 10, 100, 1000]);
  });

  it('nice ticks use 1-2-5 steps', () => {
    expect(niceTicks(0, 400, 4)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('formats ticks compactly', () => {
    expect(formatTick(1000)).toBe('1k');
    expect(formatTick(2500)).toBe('2.5k');
    expect(formatTick(10)).toBe('10');
    expect(formatTick(0.5)).toBe('0.50');
  });
});

describe('frontier', () => {
  const report = JSON.parse(readFileSync(join(__dirname, '..', 'web', 'public', 'data', 'snake-eval-report.json'), 'utf8')) as EvalReport;
  const points = frontierPoints(report);

  it('yields one point per condition', () => {
    expect(points).toHaveLength(report.conditions.length);
    expect(points.map((p) => p.label)).toEqual(report.conditions.map((c) => c.name));
  });

  it('classifies kinds and flags zero-cost points', () => {
    const kinds = new Set(points.map((p) => p.kind));
    expect(kinds).toEqual(new Set(['system2', 'hybrid', 'hybrid+guard', 'other']));
    expect(points.find((p) => p.label === 'random')!.zeroCost).toBe(true);
    expect(points.find((p) => p.label === 'guard only')!.kind).toBe('other');
  });

  it('cost domain covers every non-zero cost in whole decades', () => {
    const [lo, hi] = costDomain(points);
    for (const p of points.filter((q) => !q.zeroCost)) {
      expect(p.cost).toBeGreaterThanOrEqual(lo);
      expect(p.cost).toBeLessThanOrEqual(hi);
    }
    expect(Math.log10(lo) % 1).toBe(0);
    expect(Math.log10(hi) % 1).toBe(0);
  });
});
