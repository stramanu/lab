import { describe, expect, it } from 'vitest';
import { continuousConditions, runCondition } from '../src/eval';
import { RacingEnv, RacingGuard, RacingTeacher, racingAgrees } from '../src/games/racing';
import { ContinuousHybridPlayer, ContinuousStudentPlayer } from '../src/hybrid';
import { Ensemble, exportEnsemble } from '../src/nn';
import { ContinuousPipeline } from '../src/training';

const shortEnv = () => new RacingEnv({ maxDecisions: 40 });
const cheapTeacher = () => new RacingTeacher({ horizon: 5, margins: [0.85] });
const ensemble = () => new Ensemble({ inputSize: 20, hidden: [8, 8], low: [-0.3, -1], high: [0.3, 1], members: 3, seed: 2 });

function envAt(seed: number): RacingEnv {
  const e = shortEnv();
  e.reset(seed);
  return e;
}

describe('continuous players', () => {
  it('escalates on low confidence with ensemble + planner cost', () => {
    const ens = ensemble();
    ens.confidenceMap = { edges: [Infinity], values: [0.2] };
    const teacher = cheapTeacher();
    const m = new ContinuousHybridPlayer(ens, teacher, racingAgrees, { threshold: 0.9 }).act(envAt(1));
    expect(m.decider).toBe('system2');
    expect(m.escalationReason).toBe('confidence');
    expect(m.cost).toBe(3 + teacher.score(envAt(1)).cost);
    expect(m.teacherAction).toBeDefined();
    expect(m.continuous).toEqual(m.teacherAction);
  });

  it('escalates on a guard rejection, and acts alone when confident and safe', () => {
    const ens = ensemble();
    ens.confidenceMap = { edges: [Infinity], values: [0.99] };
    const reject = { name: 'reject', check: () => ({ ok: false, cost: 1 }), checkContinuous: () => ({ ok: false, cost: 7 }) };
    const accept = { ...reject, checkContinuous: () => ({ ok: true, cost: 7 }) };
    const rejected = new ContinuousHybridPlayer(ens, cheapTeacher(), racingAgrees, { threshold: 0.9 }, reject).act(envAt(2));
    expect(rejected).toMatchObject({ decider: 'system2', escalationReason: 'guard', guardCost: 7 });
    const accepted = new ContinuousHybridPlayer(ens, cheapTeacher(), racingAgrees, { threshold: 0.9 }, accept).act(envAt(2));
    expect(accepted).toMatchObject({ decider: 'system1', cost: 3 + 7, guardCost: 7 });
    expect(accepted.continuous).toHaveLength(2);
  });

  it('the student alone costs one unit per member', () => {
    const m = new ContinuousStudentPlayer(ensemble()).act(envAt(3));
    expect(m).toMatchObject({ decider: 'system1', cost: 3 });
  });
});

describe('continuous pipeline', () => {
  const config = { bootstrapEpisodes: 2, bootstrapEpochs: 2, iterations: 2, retrainEvery: 20, retrainEpochs: 1, consolidationEpochs: 1, hidden: [8, 8] as [number, number], members: 3, segmentLength: 10, maxMovesPerIteration: 200 };
  const game = () => ({ name: 'racing', makeEnv: shortEnv, teacher: cheapTeacher(), guard: new RacingGuard(), agrees: racingAgrees });

  it('runs the three phases and logs every step', () => {
    const p = new ContinuousPipeline(game(), config);
    p.run();
    expect(p.log.map((e) => e.phase)).toEqual(['bootstrap', 'escalation', 'escalation', 'consolidation']);
    expect(p.log[1].escalationRate).toBeGreaterThanOrEqual(0);
  });

  it('is reproducible', () => {
    const a = new ContinuousPipeline(game(), config).run();
    const b = new ContinuousPipeline(game(), config).run();
    expect(a.members).toEqual(b.members);
    expect(a.confidenceMap).toEqual(b.confidenceMap);
  });
});

describe('continuous evaluation', () => {
  it('runs every continuous condition with agreement and calibration for the student', () => {
    const ens = ensemble();
    const conditions = continuousConditions({ makeTeacher: () => cheapTeacher(), levels: [1], referenceLevel: 1, ensemble: ens, agrees: racingAgrees, thresholds: [0.5], guard: new RacingGuard() });
    expect(conditions.map((c) => c.name)).toEqual(['random', 'system2 (level 1)', 'system1', 'hybrid ensemble@0.5', 'hybrid+guard ensemble@0.5', 'guard only']);
    const results = conditions.map((c) => runCondition(c, { makeEnv: shortEnv, seeds: [10_001, 10_002], oracle: cheapTeacher(), agrees: racingAgrees }));
    const s1 = results.find((r) => r.name === 'system1')!;
    expect(s1.costPerMove).toBe(3);
    expect(s1.agreementAboveThreshold).not.toBeNull();
    expect(s1.calibration?.bins).toHaveLength(10);
    for (const r of results) expect(r.moves).toBeGreaterThan(0);
    expect(exportEnsemble(ens).members).toHaveLength(3);
  });
});
