import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  CELL_BODY,
  CELL_FOOD,
  CELL_WALL,
  EAST,
  LEFT,
  NORTH,
  RIGHT,
  SNAKE_ENCODING_SIZE,
  SOUTH,
  STRAIGHT,
  SnakeEnv,
  WEST,
  windowCategory,
} from '../src/games/snake';

describe('SnakeEnv rules', () => {
  it('dies when the head leaves the grid', () => {
    const env = SnakeEnv.fromState({ body: [[0, 2], [0, 1], [0, 0]], heading: NORTH, food: [5, 5] });
    const r = env.step(STRAIGHT);
    expect(r.done).toBe(true);
    expect(env.summary().endReason).toBe('wall');
  });

  it('dies when the head enters its body', () => {
    // Snake in a U-shape: turning right runs into the body.
    const env = SnakeEnv.fromState({
      body: [[6, 5], [6, 4], [5, 4], [4, 4], [4, 5], [5, 5]],
      heading: EAST,
      food: [10, 10],
    });
    // Heading east from (5,5): the next cell (6,5) is the tail -> allowed; go north instead into (5,4).
    const r = env.step(LEFT);
    expect(r.done).toBe(true);
    expect(env.summary().endReason).toBe('body');
  });

  it('allows moving into the cell just vacated by the tail', () => {
    const env = SnakeEnv.fromState({
      body: [[6, 5], [6, 4], [5, 4], [4, 4], [4, 5], [5, 5]],
      heading: EAST,
      food: [10, 10],
    });
    const r = env.step(STRAIGHT);
    expect(r.done).toBe(false);
    expect(env.x(env.head())).toBe(6);
    expect(env.y(env.head())).toBe(5);
    expect(env.length).toBe(6);
  });

  it('turns left relative to the heading', () => {
    const env = SnakeEnv.fromState({ body: [[5, 7], [5, 6], [5, 5]], heading: NORTH, food: [0, 0] });
    env.step(LEFT);
    expect(env.heading).toBe(WEST);
    expect([env.x(env.head()), env.y(env.head())]).toEqual([4, 5]);
    env.step(RIGHT);
    expect(env.heading).toBe(NORTH);
  });

  it('all three actions are always legal', () => {
    const env = new SnakeEnv();
    env.reset(1);
    expect(env.legalActions()).toEqual([true, true, true]);
  });

  it('eating grows the snake and respawns food on a free cell', () => {
    const env = SnakeEnv.fromState({ body: [[5, 7], [5, 6], [5, 5]], heading: NORTH, food: [5, 4], seed: 3 });
    const r = env.step(STRAIGHT);
    expect(r.reward).toBe(1);
    expect(env.length).toBe(4);
    expect(env.score()).toBe(1);
    expect(env.food).toBeGreaterThanOrEqual(0);
    expect(env.occ[env.food]).toBe(0);
  });

  it('ends by starvation after the configured limit', () => {
    const env = SnakeEnv.fromState(
      { body: [[5, 7], [5, 6], [5, 5]], heading: NORTH, food: [19, 19] },
      { starvationLimit: 3 },
    );
    // Circle in place: right, right, right, right keeps the snake alive.
    const results = [RIGHT, RIGHT, RIGHT, RIGHT].map((a) => env.step(a));
    expect(results.slice(0, 3).every((r) => !r.done)).toBe(true);
    expect(results[3].done).toBe(true);
    expect(env.summary().endReason).toBe('starvation');
  });

  it('reports an end-of-episode summary', () => {
    // Eat to reach length 5, then a tight left loop hits the body (a length-4 loop would chase its tail).
    const env = SnakeEnv.fromState({ body: [[5, 8], [5, 7], [5, 6], [5, 5]], heading: NORTH, food: [5, 4] });
    env.step(STRAIGHT);
    env.step(LEFT);
    env.step(LEFT);
    env.step(LEFT);
    const s = env.summary();
    expect(s.endReason).toBe('body');
    expect(s.score).toBe(1);
    expect(s.steps).toBe(4);
    expect(s.metrics.length).toBe(5);
    expect(s.metrics.movesPerFood).toBe(4);
  });
});

describe('SnakeEnv determinism', () => {
  function play(seed: number): string[] {
    const env = new SnakeEnv();
    env.reset(seed);
    const actions = Rng.stream(99, 'actions');
    const trace: string[] = [];
    for (let t = 0; t < 300 && !env.isDone(); t++) {
      const r = env.step(actions.int(3));
      trace.push(`${env.body().join(',')}|${env.food}|${r.score}|${r.done}`);
    }
    return trace;
  }

  it('same seed and actions produce the same states step by step', () => {
    expect(play(42)).toEqual(play(42));
  });

  it('different seeds produce different food placement', () => {
    const a = new SnakeEnv();
    const b = new SnakeEnv();
    a.reset(1);
    b.reset(2);
    expect(a.food === b.food && a.heading === b.heading).toBe(false);
  });

  it('clone evolves identically to the original', () => {
    const env = new SnakeEnv();
    env.reset(5);
    const c = env.clone();
    for (let t = 0; t < 30; t++) {
      const a = t % 7 === 0 ? RIGHT : STRAIGHT;
      expect(c.step(a)).toEqual(env.step(a));
    }
    expect(c.render()).toBe(env.render());
  });
});

describe('Snake encoding', () => {
  it('has the declared length and only finite values', () => {
    const env = new SnakeEnv();
    env.reset(7);
    const rng = Rng.stream(1, 'enc');
    for (let t = 0; t < 200 && !env.isDone(); t++) {
      const v = env.encode();
      expect(v.length).toBe(SNAKE_ENCODING_SIZE);
      expect(SNAKE_ENCODING_SIZE).toBe(201);
      expect(v.every(Number.isFinite)).toBe(true);
      env.step(rng.int(3));
    }
  });

  it('encodes out-of-grid cells as wall', () => {
    // Head at the top border heading north: the three rows ahead are outside.
    const env = SnakeEnv.fromState({ body: [[5, 2], [5, 1], [5, 0]], heading: NORTH, food: [10, 10] });
    const v = env.encode();
    for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) expect(windowCategory(v, row, col)).toBe(CELL_WALL);
    expect(windowCategory(v, 3, 3)).toBe(CELL_BODY); // the head itself
    expect(windowCategory(v, 4, 3)).toBe(CELL_BODY); // the neck, behind
  });

  it('shows food in the egocentric frame', () => {
    // Heading east, food two cells ahead: it must appear in the top-center column.
    const env = SnakeEnv.fromState({ body: [[3, 5], [4, 5], [5, 5]], heading: EAST, food: [7, 5] });
    const v = env.encode();
    expect(windowCategory(v, 1, 3)).toBe(CELL_FOOD);
    expect(v[196]).toBeGreaterThan(0); // ahead
    expect(v[197]).toBe(0);
  });

  it('is invariant to a 90° rotation of the whole scene', () => {
    const W = 20;
    const rot = ([x, y]: [number, number]): [number, number] => [W - 1 - y, x];
    const body: Array<[number, number]> = [[2, 4], [2, 3], [2, 2], [3, 2], [4, 2], [4, 1]];
    const food: [number, number] = [6, 0];
    const a = SnakeEnv.fromState({ body, heading: NORTH, food });
    const b = SnakeEnv.fromState({ body: body.map(rot), heading: EAST, food: rot(food) });
    expect(Array.from(b.encode())).toEqual(Array.from(a.encode()));
  });
});

describe('Snake render', () => {
  it('renders a small grid', () => {
    const env = SnakeEnv.fromState(
      { body: [[0, 2], [1, 2], [1, 1]], heading: NORTH, food: [3, 0] },
      { width: 4, height: 3 },
    );
    expect(env.render()).toBe(['######', '#...*#', '#.^..#', '#oo..#', '######'].join('\n'));
    expect(SOUTH).toBe(2);
  });
});
