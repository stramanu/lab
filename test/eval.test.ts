import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkHypotheses, evalSeeds, formatReport, runCondition, standardConditions, type ConditionResult } from '../src/eval';
import { SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';
import { Mlp } from '../src/nn';
import { DEFAULT_PIPELINE, TrainingPipeline } from '../src/training';

describe('evaluation seeds', () => {
  it('the published file matches evalSeeds() and has 200 seeds', () => {
    const file = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'eval-seeds.json'), 'utf8'));
    expect(file.seeds).toEqual(evalSeeds());
    expect(file.seeds).toHaveLength(200);
  });

  it('is disjoint from training seeds', () => {
    const p = new TrainingPipeline(
      { name: 'snake', makeEnv: () => new SnakeEnv(), teacher: new SnakeTeacher({ depth: 0 }) },
      { maxEpisodeSteps: 50, bootstrapEpisodes: 3, datasetCapacity: 1000, validationCapacity: 100, hidden: [4, 4], bootstrapEpochs: 1 },
    );
    p.bootstrap();
    const train = new Set(p.trainingSeeds());
    expect(train.size).toBe(3);
    expect(evalSeeds().filter((s) => train.has(s))).toEqual([]);
    expect(Math.max(...evalSeeds())).toBeLessThan(DEFAULT_PIPELINE.trainSeedStart);
  });
});

describe('condition runner', () => {
  it('produces a result for every condition with the required fields', () => {
    const net = new Mlp({ inputSize: 201, hidden: [8, 8], outputSize: 3, seed: 1 });
    const conditions = standardConditions({
      makeTeacher: (depth) => new SnakeTeacher({ depth }),
      levels: [0, 1],
      referenceLevel: 0,
      net,
      temperature: 1,
    });
    // random, 2 system2, system1, 5 thresholds x 2 measures
    expect(conditions).toHaveLength(1 + 2 + 1 + 10);
    const oracle = new SnakeTeacher({ depth: 0 });
    // Short episodes: small grid keeps the test fast.
    const results = conditions.map((c) => runCondition(c, { makeEnv: () => new SnakeEnv({ width: 8, height: 8 }), seeds: [1, 2], oracle }));
    for (const r of results) {
      expect(r.episodes).toBe(2);
      expect(Number.isFinite(r.score.mean)).toBe(true);
      expect(r.score.ci95).toBeGreaterThanOrEqual(0);
      expect(Object.values(r.endReasons).reduce((a, b) => a + b, 0)).toBe(2);
      expect(r.moves).toBeGreaterThan(0);
      expect(r.costPerMove).toBeGreaterThanOrEqual(0);
      expect(r.usPerMove).toBeGreaterThan(0);
      expect(r.gameMetrics).toHaveProperty('length');
    }
    const byKind = (k: string) => results.filter((r) => r.kind === k);
    expect(byKind('system2').every((r) => r.system2Calls === r.moves && r.escalationRate === null)).toBe(true);
    expect(byKind('system1').every((r) => r.costPerMove === 1 && r.system2Calls === 0 && r.calibration !== null)).toBe(true);
    for (const h of byKind('hybrid')) {
      expect(h.escalationRate).not.toBeNull();
      expect(h.calibration?.bins).toHaveLength(10);
    }
    // An untrained student at threshold 0.95 escalates almost everything.
    expect(byKind('hybrid').find((h) => h.name === 'hybrid maxProb@0.95')!.escalationRate!).toBeGreaterThan(0.5);
  });
});

function fakeCondition(over: Partial<ConditionResult> & Pick<ConditionResult, 'name' | 'kind'>): ConditionResult {
  return {
    params: {},
    episodes: 10,
    score: { mean: 0, ci95: 0, median: 0, min: 0, max: 0 },
    endReasons: {},
    gameMetrics: {},
    moves: 100,
    costPerMove: 1,
    usPerMove: 1,
    system2Calls: 0,
    escalationRate: null,
    escalationByReason: null,
    guardCostShare: null,
    agreementAboveThreshold: null,
    calibration: null,
    ...over,
  };
}

function syntheticReport(hybridScore: number, hybridCost: number, s1Score: number, agreement: number) {
  return [
    fakeCondition({ name: 'system2 (level 1)', kind: 'system2', params: { level: 1 }, score: { mean: 100, ci95: 1, median: 100, min: 90, max: 110 }, costPerMove: 1000 }),
    fakeCondition({ name: 'system1', kind: 'system1', score: { mean: s1Score, ci95: 1, median: s1Score, min: 0, max: 0 } }),
    fakeCondition({
      name: 'hybrid maxProb@0.9',
      kind: 'hybrid',
      params: { threshold: 0.9, confidence: 'maxProb' },
      score: { mean: hybridScore, ci95: 1, median: hybridScore, min: 0, max: 0 },
      costPerMove: hybridCost,
      agreementAboveThreshold: agreement,
    }),
  ];
}

describe('hypothesis checks', () => {
  it('confirms all four on a favorable synthetic report', () => {
    const h = checkHypotheses({ conditions: syntheticReport(95, 50, 70, 0.97), trainingEscalation: [0.9, 0.3, 0.08, 0.07, 0.06], referenceLevel: 1 });
    expect(h.map((x) => [x.id, x.confirmed])).toEqual([['H1', true], ['H2', true], ['H3', true], ['H4', true]]);
    expect(h[1].details.costRatio).toBe(20);
  });

  it('rejects all four on an unfavorable synthetic report', () => {
    const h = checkHypotheses({ conditions: syntheticReport(95, 200, 40, 0.9), trainingEscalation: [0.9, 0.3, 0.2, 0.2, 0.2], referenceLevel: 1 });
    expect(h.map((x) => x.confirmed)).toEqual([false, false, false, false]);
    // H2 fails on cost even though the score ratio is fine.
    expect(h[1].details.scoreRatio).toBeCloseTo(0.95);
    expect(h[1].details.costRatio).toBe(5);
  });

  it('formats a table with one row per condition', () => {
    const conditions = syntheticReport(95, 50, 70, 0.97);
    const text = formatReport({
      game: 'snake',
      createdAt: '',
      seeds: { count: 200, first: 1, last: 200 },
      model: { params: 17283, weightsKB: 90, calibrationT: 1.1, trainingSeconds: 60 },
      hardware: { cpu: 'test' },
      conditions,
      hypotheses: checkHypotheses({ conditions, referenceLevel: 1 }),
    });
    for (const c of conditions) expect(text).toContain(c.name);
    expect(text).toContain('H4 CONFIRMED');
    expect(text).toContain('H1 NOT CONFIRMED');
  });
});

describe('guarded conditions', () => {
  it('adds guarded hybrids and guard only, with a consistent escalation breakdown', () => {
    const net = new Mlp({ inputSize: 201, hidden: [8, 8], outputSize: 3, seed: 2 });
    const conditions = standardConditions({
      makeTeacher: (depth) => new SnakeTeacher({ depth }),
      levels: [0],
      referenceLevel: 0,
      net,
      temperature: 1,
      thresholds: [0.5, 0.9],
      measures: ['maxProb'],
      guard: new SnakeGuard(),
    });
    expect(conditions.map((c) => c.name)).toEqual([
      'random',
      'system2 (level 0)',
      'system1',
      'hybrid maxProb@0.5',
      'hybrid maxProb@0.9',
      'hybrid+guard maxProb@0.5',
      'hybrid+guard maxProb@0.9',
      'guard only',
    ]);
    const results = conditions.map((c) => runCondition(c, { makeEnv: () => new SnakeEnv({ width: 8, height: 8 }), seeds: [1, 2] }));
    for (const r of results.filter((x) => x.kind === 'hybrid')) {
      const b = r.escalationByReason!;
      expect(b.confidence + b.guard).toBeCloseTo(r.escalationRate!, 10);
    }
    // The guard runs only on confident proposals: always in guard only (threshold 0).
    expect(results.find((r) => r.name === 'guard only')!.guardCostShare!).toBeGreaterThan(0);
    expect(results.find((r) => r.name === 'hybrid maxProb@0.5')!.guardCostShare).toBeNull();
    expect(results.find((r) => r.name === 'guard only')!.escalationByReason!.confidence).toBe(0);
  });
});

describe('hypotheses with guarded variants', () => {
  it('when H2 fails, reports the variant closest to both targets', () => {
    const base = syntheticReport(99, 400, 30, 0.97); // high score, 2.5x cost
    const cheap = fakeCondition({
      name: 'hybrid+guard maxProb@0.7',
      kind: 'hybrid',
      params: { threshold: 0.7, confidence: 'maxProb', guard: 'g' },
      score: { mean: 97, ci95: 1, median: 97, min: 0, max: 0 },
      costPerMove: 105, // 9.5x
    });
    const h = checkHypotheses({ conditions: [...base, cheap], referenceLevel: 1 });
    expect(h[1].confirmed).toBe(false);
    expect(h[1].details.best).toBe('hybrid+guard maxProb@0.7');
  });

  it('H2 picks a guarded hybrid; H4 stays on the unguarded primary hybrid', () => {
    const base = syntheticReport(40, 900, 30, 0.97);
    const guarded = fakeCondition({
      name: 'hybrid+guard maxProb@0.7',
      kind: 'hybrid',
      params: { threshold: 0.7, confidence: 'maxProb', guard: 'g' },
      score: { mean: 95, ci95: 1, median: 95, min: 0, max: 0 },
      costPerMove: 80,
      agreementAboveThreshold: 0.5,
    });
    const guarded09 = fakeCondition({ ...guarded, name: 'hybrid+guard maxProb@0.9', params: { threshold: 0.9, confidence: 'maxProb', guard: 'g' } });
    const h = checkHypotheses({ conditions: [...base, guarded, guarded09], referenceLevel: 1 });
    expect(h[1].confirmed).toBe(true);
    expect(h[1].details.best).toBe('hybrid+guard maxProb@0.7');
    // H4 ignores the guarded condition's (poor) agreement.
    expect(h[3].details.agreement).toBe(0.97);
  });
});
