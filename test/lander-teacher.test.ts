import { describe, expect, it } from 'vitest';
import { argmax } from '../src/core/types';
import { Rng } from '../src/core/rng';
import { LanderEnv, LanderGuard, LanderTeacher, MAIN, NONE, pilotAction, type World } from '../src/games/lander';

function flatWorld(): World {
  return { heights: new Float64Array(21).fill(5), spacing: 5, padX0: 44, padX1: 56, padY: 5, wind0: 0, windPhase: 0 };
}
const env = (state: Parameters<typeof LanderEnv.fromState>[1]) => LanderEnv.fromState(flatWorld(), state, { windScale: 0 });

describe('LanderTeacher', () => {
  it('fires the main engine when falling fast just above the pad', () => {
    // 5 m above the pad at -5 m/s: braking now lands, waiting one decision crashes.
    const e = env({ x: 50, y: 10, vy: -5 });
    const { scores } = new LanderTeacher().score(e);
    expect(argmax(scores)).toBe(MAIN);
  });

  it('gives every action a finite score and a positive integer cost', () => {
    const e = new LanderEnv();
    e.reset(3);
    const r = new LanderTeacher().score(e);
    expect(Array.from(r.scores).every(Number.isFinite)).toBe(true);
    expect(Number.isInteger(r.cost) && r.cost > 0).toBe(true);
  });

  it('is deterministic for the same state', () => {
    const e = new LanderEnv();
    e.reset(4);
    const t = new LanderTeacher();
    const a = t.score(e);
    const b = t.score(e.clone());
    expect(Array.from(a.scores)).toEqual(Array.from(b.scores));
    expect(a.cost).toBe(b.cost);
  });

  it('costs more with a deeper tree or a longer rollout', () => {
    const e = new LanderEnv();
    e.reset(5);
    const base = new LanderTeacher({ depth: 1, rolloutHorizon: 50 }).score(e).cost;
    expect(new LanderTeacher({ depth: 2, rolloutHorizon: 50 }).score(e).cost).toBeGreaterThan(base);
    expect(new LanderTeacher({ depth: 1, rolloutHorizon: 100 }).score(e).cost).toBeGreaterThan(base);
  });
});

describe('LanderGuard', () => {
  const guard = new LanderGuard();

  it('rejects doing nothing while falling fast just above the ground', () => {
    const e = env({ x: 50, y: 6, vy: -6 });
    expect(guard.check(e, NONE).ok).toBe(false);
  });

  it('accepts doing nothing high above the pad, slow and upright', () => {
    const e = env({ x: 50, y: 50, vy: -0.5 });
    expect(guard.check(e, NONE).ok).toBe(true);
  });

  it('does not mutate the environment', () => {
    const e = new LanderEnv();
    e.reset(6);
    const before = JSON.stringify(e.state);
    guard.check(e, MAIN);
    expect(JSON.stringify(e.state)).toBe(before);
  });

  it('costs at most a tenth of the teacher on a teacher-played episode', () => {
    const teacher = new LanderTeacher();
    const e = new LanderEnv();
    e.reset(8);
    let g = 0;
    let t = 0;
    let n = 0;
    while (!e.isDone()) {
      const r = teacher.score(e);
      const a = argmax(r.scores);
      g += guard.check(e, a).cost;
      t += r.cost;
      n++;
      e.step(a);
    }
    expect(g / n).toBeLessThanOrEqual(t / n / 10);
  });
});

describe('lander reference quality', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => 6000 + i);
  const landRate = (act: (e: LanderEnv) => number) =>
    seeds.filter((seed) => {
      const e = new LanderEnv();
      e.reset(seed);
      while (!e.isDone()) e.step(act(e));
      return e.state.end === 'landed';
    }).length / seeds.length;

  it('the teacher lands at least 90%, never less than the autopilot, and random at most 5%', () => {
    const teacher = new LanderTeacher();
    const teacherRate = landRate((e) => argmax(teacher.score(e).scores));
    const pilotRate = landRate((e) => pilotAction(e.state, e.world, e.config));
    const rng = new Rng(1);
    const randomRate = landRate(() => rng.int(4));
    expect(teacherRate).toBeGreaterThanOrEqual(0.9);
    expect(teacherRate).toBeGreaterThanOrEqual(pilotRate);
    expect(randomRate).toBeLessThanOrEqual(0.05);
  });
});

describe('lander tie-breaking', () => {
  it("prefers the autopilot's action when every action reaches an equivalent landing", () => {
    // High above the pad, slow and upright: all actions can still land equally well.
    const e = env({ x: 50, y: 40, vy: -0.5 });
    const { scores } = new LanderTeacher({ depth: 1 }).score(e);
    expect(argmax(scores)).toBe(pilotAction(e.state, e.world, e.config));
    expect(new Set(Array.from(scores)).size).toBe(4);
  });
});

describe('lander pipeline reproducibility', () => {
  it('a reduced lander run gives identical weights twice', async () => {
    const { TrainingPipeline } = await import('../src/training');
    const { getGame } = await import('../src/games/registry');
    const g = getGame('lander');
    const config = { ...g.pipeline, bootstrapEpisodes: 2, bootstrapEpochs: 1, iterations: 1, retrainEvery: 100, retrainEpochs: 1, consolidationEpochs: 1, hidden: [8, 8] as [number, number], datasetCapacity: 5000, validationCapacity: 1000, maxEpisodeSteps: 60 };
    const run = () => new TrainingPipeline({ name: 'lander', makeEnv: g.makeEnv, teacher: g.makeTeacher(1), guard: g.makeGuard() }, config).run();
    expect(run().weights).toBe(run().weights);
  });
});
