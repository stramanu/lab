import { describe, expect, it } from 'vitest';
import { argmax } from '../src/core/types';
import { EAST, LEFT, NORTH, RIGHT, STRAIGHT, SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';

const guard = new SnakeGuard();

describe('SnakeGuard', () => {
  it('rejects immediate death', () => {
    const env = SnakeEnv.fromState({ body: [[5, 2], [5, 1], [5, 0]], heading: NORTH, food: [10, 10] });
    expect(guard.check(env, STRAIGHT).ok).toBe(false);
    expect(guard.check(env, LEFT).ok).toBe(true);
  });

  it('rejects a self-trap', () => {
    // The body walls off a 2-cell pocket, (1,2) and (1,1); the head at (1,3) faces into it
    // while the tail at (6,6) lies outside.
    const env = SnakeEnv.fromState({
      body: [[6, 6], [5, 6], [4, 6], [3, 6], [2, 6], [2, 5], [2, 4], [2, 3], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
      heading: NORTH,
      food: [15, 15],
    });
    // Straight enters the pocket: not lethal now, but the tail becomes unreachable.
    expect(guard.check(env, STRAIGHT).ok).toBe(false);
    // Right (east) hits body at (2,3); left (west) hits body at (0,3): both lethal.
    expect(guard.check(env, RIGHT).ok).toBe(false);
    expect(guard.check(env, LEFT).ok).toBe(false);
  });

  it('accepts a safe move on an open board with a small cost', () => {
    const env = SnakeEnv.fromState({ body: [[3, 5], [4, 5], [5, 5]], heading: EAST, food: [15, 15] });
    const r = guard.check(env, STRAIGHT);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(1);
    expect(Number.isInteger(r.cost)).toBe(true);
  });

  it('accepts a winning move', () => {
    // 2x2 board: length 3, food on the last free cell.
    const env = SnakeEnv.fromState({ body: [[0, 1], [0, 0], [1, 0]], heading: EAST, food: [1, 1] }, { width: 2, height: 2 });
    // Heading east at (1,0): right turns south into (1,1) = food = win.
    expect(guard.check(env, RIGHT)).toEqual({ ok: true, cost: 1 });
  });

  it('is deterministic and does not mutate the environment', () => {
    const env = new SnakeEnv();
    env.reset(4);
    const before = env.render();
    const a = guard.check(env, LEFT);
    const b = guard.check(env, LEFT);
    expect(a).toEqual(b);
    expect(env.render()).toBe(before);
    expect(env.steps).toBe(0);
  });

  it('costs at most a tenth of the teacher on a teacher-played episode', () => {
    const teacher = new SnakeTeacher();
    const env = new SnakeEnv();
    env.reset(21);
    let guardCost = 0;
    let teacherCost = 0;
    let n = 0;
    for (let t = 0; t < 3000 && !env.isDone(); t++) {
      const r = teacher.score(env);
      const action = argmax(r.scores);
      guardCost += guard.check(env, action).cost;
      teacherCost += r.cost;
      n++;
      env.step(action);
    }
    expect(guardCost / n).toBeLessThanOrEqual(teacherCost / n / 10);
  });
});
