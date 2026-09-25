import { beforeAll, describe, expect, it } from 'vitest';
import { CANDIDATES, initQuadrupedPhysics, QuadrupedEnv, QuadrupedGuard, QuadrupedTeacher } from '../src/games/quadruped';

const ZERO = [0, 0, 0, 0];

function walking(seed: number, decisions: number, pushImpulse = 0): QuadrupedEnv {
  const env = new QuadrupedEnv({ pushImpulse });
  env.reset(seed);
  for (let d = 0; d < decisions && !env.isDone(); d++) env.advance(ZERO);
  return env;
}

/** Hits the walking robot sideways and returns it one decision later. */
function pushed(seed: number, impulse: number): QuadrupedEnv {
  const env = walking(seed, 20);
  env.pushes = [{ time: env.time, impulse: [0, 0, impulse] }];
  env.nextPush = 0;
  env.advance(ZERO);
  return env;
}

describe('quadruped planner and guard', () => {
  beforeAll(async () => {
    await initQuadrupedPhysics();
  });

  it('gives the same answer for the same state, and leaves the live state untouched', () => {
    const env = walking(10001, 20);
    const before = Array.from(env.encode());
    const teacher = new QuadrupedTeacher({ horizon: 5 });
    const a = teacher.score(env);
    const b = teacher.score(env);
    expect(Array.from(a.scores)).toEqual(Array.from(b.scores));
    expect(a.cost).toBe(b.cost);
    expect(Array.from(env.encode())).toEqual(before);
    env.dispose();
  });

  it('gives the same answer when its candidates are evaluated separately and combined (as the page does)', () => {
    const env = new QuadrupedEnv();
    env.reset(10005);
    for (let d = 0; d < 15; d++) env.advance([0, 0, 0, 0]);
    const t = new QuadrupedTeacher();
    const whole = t.targetAction(env);
    const snap = env.snapshot();
    const values = new Float64Array(CANDIDATES.length);
    let cost = 0;
    // Three "workers", each with its own share of the candidates, in reverse order.
    for (const share of [[20, 17, 14, 11, 8, 5, 2], [19, 16, 13, 10, 7, 4, 1], [18, 15, 12, 9, 6, 3, 0]]) {
      for (const a of share) {
        const r = t.candidateValue(env, snap, env.score(), a);
        values[a] = r.value;
        cost += r.cost;
      }
    }
    const split = t.choose(t.combine(values, cost));
    expect(Array.from(split.scores)).toEqual(Array.from(whole.scores));
    expect(Array.from(split.action)).toEqual(Array.from(whole.action));
    expect(split.cost).toBe(whole.cost);
    env.dispose();
  });

  it('costs strictly more with a longer horizon', () => {
    const env = walking(10002, 20);
    const costs = [5, 10, 20].map((horizon) => new QuadrupedTeacher({ horizon }).score(env).cost);
    expect(costs[0]).toBeLessThan(costs[1]);
    expect(costs[1]).toBeLessThan(costs[2]);
    env.dispose();
  });

  it('never keeps the base controller when it falls and another candidate does not', () => {
    const teacher = new QuadrupedTeacher({ horizon: 5 });
    let found = 0;
    // 7–9 N·s sideways: the base controller falls within 0.5 s, but some modulation recovers.
    for (const impulse of [7, 8, 9]) {
      const env = pushed(10003, impulse);
      const r = teacher.score(env);
      const baseFalls = r.scores[0] < -50;
      const someoneStands = Array.from(r.scores).some((v) => v > -50);
      if (baseFalls && someoneStands) {
        found++;
        expect(teacher.targetAction(env).action.some((v) => v !== 0)).toBe(true);
      }
      env.dispose();
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);

  it('guard accepts calm walking and rejects a falling state, for a tenth of the planner cost', () => {
    const guard = new QuadrupedGuard();
    const calm = walking(10004, 20);
    const ok = guard.checkContinuous(calm, ZERO);
    expect(ok.ok).toBe(true);
    const planner = new QuadrupedTeacher({ horizon: 10 }).score(calm);
    expect(ok.cost).toBeLessThanOrEqual(planner.cost / 10);
    calm.dispose();
    // 12 N·s sideways: one decision later the robot is still up but will fall within 0.2 s.
    const falling = pushed(10004, 12);
    expect(falling.isDone()).toBe(false);
    expect(guard.checkContinuous(falling, ZERO).ok).toBe(false);
    falling.dispose();
  }, 60_000);
});
