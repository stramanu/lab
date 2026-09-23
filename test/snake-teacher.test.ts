import { describe, expect, it } from 'vitest';
import { RandomPlayer } from '../src/core/players';
import { argmax } from '../src/core/types';
import {
  DEATH_SCORE,
  EAST,
  LEFT,
  NORTH,
  RIGHT,
  STRAIGHT,
  SnakeEnv,
  SnakeTeacher,
  distanceToFood,
  reachableArea,
  tailReachable,
  type CostCounter,
} from '../src/games/snake';

describe('Snake search primitives', () => {
  it('BFS distance to food on an open grid is Manhattan distance', () => {
    const env = SnakeEnv.fromState({ body: [[5, 7], [5, 6], [5, 5]], heading: NORTH, food: [8, 2] });
    const c: CostCounter = { nodes: 0 };
    expect(distanceToFood(env, c)).toBe(6);
    expect(c.nodes).toBeGreaterThan(0);
  });

  it('BFS routes around the body', () => {
    // A wall of body at y=4 from x=3..7 blocks the direct path upward.
    const env = SnakeEnv.fromState({
      body: [[3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [7, 5], [6, 5], [5, 5]],
      heading: WEST_HEADING,
      food: [5, 2],
    });
    expect(distanceToFood(env, { nodes: 0 })).toBe(9); // (4,5)(3,5)(2,5)(2,4)(2,3)(2,2)(3,2)(4,2)(5,2)
  });

  it('detects an unreachable tail and measures the trapped area', () => {
    // Head sealed into the top-left corner cell (0,0) by its own body; tail far away.
    const env = SnakeEnv.fromState({
      body: [[5, 5], [4, 5], [3, 5], [2, 5], [2, 4], [2, 3], [2, 2], [2, 1], [2, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
      heading: NORTH,
      food: [10, 10],
    });
    const c: CostCounter = { nodes: 0 };
    expect(tailReachable(env, c)).toBe(false);
    expect(reachableArea(env, c)).toBe(0);
    expect(distanceToFood(env, c)).toBe(-1);
  });

  it('the tail is reachable on an open board', () => {
    const env = SnakeEnv.fromState({ body: [[5, 7], [5, 6], [5, 5]], heading: NORTH, food: [0, 0] });
    expect(tailReachable(env, { nodes: 0 })).toBe(true);
    expect(reachableArea(env, { nodes: 0 })).toBe(400 - 3);
  });
});

const WEST_HEADING = 3;

describe('SnakeTeacher', () => {
  it('gives immediate death the lowest score', () => {
    // Heading north at the top border: straight hits the wall.
    const env = SnakeEnv.fromState({ body: [[5, 2], [5, 1], [5, 0]], heading: NORTH, food: [10, 10] });
    for (const depth of [0, 1, 2]) {
      const { scores } = new SnakeTeacher({ depth }).score(env);
      expect(scores[STRAIGHT]).toBe(DEATH_SCORE);
      expect(scores[STRAIGHT]).toBeLessThan(scores[LEFT]);
      expect(scores[STRAIGHT]).toBeLessThan(scores[RIGHT]);
    }
  });

  it('prefers the safe action that shortens the path to the food', () => {
    const cases = [
      { body: [[5, 7], [5, 6], [5, 5]] as Array<[number, number]>, heading: NORTH, food: [9, 5] as [number, number], best: RIGHT },
      { body: [[5, 7], [5, 6], [5, 5]] as Array<[number, number]>, heading: NORTH, food: [5, 1] as [number, number], best: STRAIGHT },
      { body: [[3, 5], [4, 5], [5, 5]] as Array<[number, number]>, heading: EAST, food: [5, 1] as [number, number], best: LEFT },
    ];
    for (const depth of [0, 1, 2]) {
      for (const c of cases) {
        const env = SnakeEnv.fromState({ body: c.body, heading: c.heading, food: c.food });
        const { scores } = new SnakeTeacher({ depth }).score(env);
        expect(argmax(scores)).toBe(c.best);
      }
    }
  });

  it('cost grows with the lookahead depth', () => {
    const env = new SnakeEnv();
    env.reset(11);
    const c0 = new SnakeTeacher({ depth: 0 }).score(env).cost;
    const c1 = new SnakeTeacher({ depth: 1 }).score(env).cost;
    const c2 = new SnakeTeacher({ depth: 2 }).score(env).cost;
    expect(Number.isInteger(c0)).toBe(true);
    expect(c0).toBeGreaterThan(0);
    expect(c1).toBeGreaterThanOrEqual(c0);
    expect(c2).toBeGreaterThanOrEqual(c1);
  });

  it('cost and scores are deterministic', () => {
    const env = new SnakeEnv();
    env.reset(12);
    const t = new SnakeTeacher({ depth: 2 });
    const a = t.score(env);
    const b = t.score(env);
    expect(Array.from(a.scores)).toEqual(Array.from(b.scores));
    expect(a.cost).toBe(b.cost);
  });

  it('every legal action gets a finite score', () => {
    const env = new SnakeEnv();
    env.reset(13);
    const { scores } = new SnakeTeacher().score(env);
    expect(Array.from(scores).every(Number.isFinite)).toBe(true);
  });

  it('plays at least 10x better than random', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => 5000 + i);
    const teacher = new SnakeTeacher();
    const random = new RandomPlayer(1);
    let teacherTotal = 0;
    let randomTotal = 0;
    for (const seed of seeds) {
      const env = new SnakeEnv();
      env.reset(seed);
      while (!env.isDone()) env.step(argmax(teacher.score(env).scores));
      teacherTotal += env.score();
      env.reset(seed);
      while (!env.isDone()) env.step(random.act(env).action);
      randomTotal += env.score();
    }
    const teacherMean = teacherTotal / seeds.length;
    const randomMean = Math.max(randomTotal / seeds.length, 0.1);
    expect(teacherMean).toBeGreaterThanOrEqual(10 * randomMean);
  });
});

describe('SnakeTeacher tie-breaking', () => {
  it('prefers straight over an equivalent left turn by a visible margin', () => {
    // Heading north, food up-left: straight and left both shorten the path by one.
    const env = SnakeEnv.fromState({ body: [[10, 12], [10, 11], [10, 10]], heading: NORTH, food: [7, 7] });
    for (const depth of [0, 1, 2]) {
      const { scores } = new SnakeTeacher({ depth }).score(env);
      expect(argmax(scores)).toBe(STRAIGHT);
      expect(scores[STRAIGHT] - scores[LEFT]).toBeGreaterThanOrEqual(0.2);
    }
  });
});
