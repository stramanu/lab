import { describe, expect, it } from 'vitest';
import { aggregateRuns, tInterval, tQuantile975, type ConditionResult } from '../src/eval';

function cond(name: string, kind: ConditionResult['kind'], params: ConditionResult['params'], score: number, cost: number, agreement: number | null = null): ConditionResult {
  return {
    name,
    kind,
    params,
    episodes: 10,
    score: { mean: score, ci95: 0, median: score, min: score, max: score },
    endReasons: {},
    gameMetrics: {},
    moves: 100,
    costPerMove: cost,
    usPerMove: 1,
    system2Calls: 0,
    escalationRate: kind === 'hybrid' ? 0.05 : null,
    escalationByReason: null,
    guardCostShare: null,
    agreementAboveThreshold: agreement,
    calibration: agreement === null ? null : { ece: 0.02, bins: [] },
  };
}

/** One run: planner 100 @ 1000; hybrid @0.9 with the given score and cost; student 70. */
const run = (hybridScore: number, hybridCost: number) => ({
  conditions: [
    cond('system2 (level 1)', 'system2', { level: 1 }, 100, 1000),
    cond('system1', 'system1', {}, 70, 1, 0.9),
    cond('hybrid maxProb@0.9', 'hybrid', { threshold: 0.9, confidence: 'maxProb' }, hybridScore, hybridCost, 0.97),
  ],
  trainingEscalation: [0.9, 0.2, 0.05, 0.05, 0.05],
});

describe('t-interval', () => {
  it('uses Student quantiles', () => {
    expect(tQuantile975(4)).toBeCloseTo(2.776, 3);
    const iv = tInterval([1, 2, 3, 4, 5]);
    expect(iv.mean).toBe(3);
    expect(iv.ci95).toBeCloseTo((2.776 * Math.sqrt(2.5)) / Math.sqrt(5), 6);
    expect(tInterval([7]).ci95).toBe(0);
  });
});

describe('aggregateRuns', () => {
  it('aggregates per condition and tallies hypotheses per run', () => {
    // H2 holds in runs with score >= 90 and cost <= 100: runs 1-3 yes, 4-5 no; the mean fails (score 88.4).
    const runs = [run(95, 50), run(92, 60), run(91, 90), run(80, 50), run(84, 200)];
    const agg = aggregateRuns(runs, { referenceLevel: 1 }, new Set(['system2 (level 1)']));
    expect(agg.runs).toBe(5);
    const hybrid = agg.conditions.find((c) => c.name === 'hybrid maxProb@0.9')!;
    expect(hybrid.score.values).toEqual([95, 92, 91, 80, 84]);
    expect(hybrid.score.mean).toBeCloseTo(88.4, 10);
    expect(hybrid.score.ci95).toBeGreaterThan(0);
    expect(agg.conditions[0].shared).toBe(true);
    const h2 = agg.hypotheses.find((h) => h.id === 'H2')!;
    expect(h2.runsConfirmed).toBe('3/5');
    expect(h2.confirmed).toBe(false);
    expect(agg.hypotheses.find((h) => h.id === 'H3')!.runsConfirmed).toBe('5/5');
    expect(agg.hypotheses.find((h) => h.id === 'H1')!.confirmed).toBe(true);
  });

  it('rejects runs with different conditions', () => {
    const a = run(95, 50);
    const b = { ...run(95, 50), conditions: run(95, 50).conditions.slice(0, 2) };
    expect(() => aggregateRuns([a, b], { referenceLevel: 1 })).toThrow();
  });
});
