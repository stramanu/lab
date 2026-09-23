import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getGame } from '../src/games/registry';
import { formatTick, linearScale, logScale, niceTicks } from '../web/charts';
import { costDomain, frontierPoints, referencePoint, scoreDomain, type StudyFile } from '../web/frontier';

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

describe('frontier from studies', () => {
  for (const game of ['snake', 'lander']) {
    const study = JSON.parse(readFileSync(join(__dirname, '..', 'web', 'public', 'data', `${game}-study.json`), 'utf8')) as StudyFile;
    const points = frontierPoints(study);

    it(`${game}: one point per condition, with intervals`, () => {
      expect(points).toHaveLength(study.conditions.length);
      expect(points.map((p) => p.label)).toEqual(study.conditions.map((c) => c.name));
      expect(study.runs).toBe(5);
      expect(study.split).toBe('test');
      expect(points.some((p) => p.ci95 > 0)).toBe(true);
    });

    it(`${game}: kinds, zero-cost flag and reference planner`, () => {
      expect(points.find((p) => p.label === 'random')!.zeroCost).toBe(true);
      expect(points.find((p) => p.label === 'guard only')!.kind).toBe('other');
      expect(new Set(points.map((p) => p.kind))).toContain('hybrid+guard');
      const level = getGame(game).referenceLevel;
      expect(referencePoint(points, level)?.kind).toBe('system2');
    });

    it(`${game}: domains cover every point`, () => {
      const [lo, hi] = costDomain(points);
      const [, top] = scoreDomain(points);
      for (const p of points.filter((q) => !q.zeroCost)) {
        expect(p.cost).toBeGreaterThanOrEqual(lo);
        expect(p.cost).toBeLessThanOrEqual(hi);
        expect(p.score + p.ci95).toBeLessThanOrEqual(top);
      }
    });
  }
  it('lander study includes the autopilot baseline', () => {
    const study = JSON.parse(readFileSync(join(__dirname, '..', 'web', 'public', 'data', 'lander-study.json'), 'utf8')) as StudyFile;
    expect(frontierPoints(study).find((p) => p.label === 'autopilot')!.kind).toBe('baseline');
  });
});
