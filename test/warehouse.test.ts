import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { argmax } from '../src/core/types';
import {
  EAST,
  SOUTH,
  WAIT,
  WAREHOUSE_ENCODING_SIZE,
  WEST,
  WarehouseEnv,
  WarehouseGuard,
  WarehouseTeacher,
  greedyAction,
  makeLayout,
  DEFAULT_WAREHOUSE_CONFIG,
} from '../src/games/warehouse';

const small = { robots: 4, timesteps: 30 };

/** Places robots at given cells with given goals (test helper). */
function place(env: WarehouseEnv, cells: number[], goals: number[]): void {
  env.occ.fill(0);
  env.claimed.fill(0);
  env.decided.fill(0);
  env.turn = 0;
  env.start = 0;
  cells.forEach((c, r) => {
    env.pos[r] = c;
    env.next[r] = c;
    env.occ[c] = r + 1;
    env.goal[r] = goals[r];
  });
}

describe('warehouse environment', () => {
  const W = DEFAULT_WAREHOUSE_CONFIG.width;
  const at = (x: number, y: number) => y * W + x;

  it('layout is fixed by the config; seeds set robots and goals', () => {
    const l = makeLayout(DEFAULT_WAREHOUSE_CONFIG);
    expect(l.stations).toHaveLength(10);
    expect(l.shelfAccess.length).toBeGreaterThan(50);
    const a = new WarehouseEnv();
    const b = new WarehouseEnv();
    const c = new WarehouseEnv();
    a.reset(1);
    b.reset(1);
    c.reset(2);
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
    expect(Array.from(a.goal)).toEqual(Array.from(b.goal));
    expect(Array.from(a.pos)).not.toEqual(Array.from(c.pos));
  });

  it('counts a delivery and assigns a new goal', () => {
    const env = new WarehouseEnv(small);
    env.reset(3);
    place(env, [at(2, 1), at(2, 5), at(2, 9), at(2, 13)], [at(3, 1), at(2, 17), at(2, 17), at(2, 17)]);
    env.step(EAST);
    for (let k = 1; k < 4; k++) env.step(WAIT);
    expect(env.deliveries).toBe(1);
    expect(env.goal[0]).not.toBe(at(3, 1));
  });

  it('rotates the decision order each timestep', () => {
    const env = new WarehouseEnv(small);
    env.reset(4);
    expect(env.current).toBe(0);
    for (let k = 0; k < 4; k++) env.step(WAIT);
    expect(env.current).toBe(1);
  });

  it('blocks a move into a claimed cell (vertex conflict)', () => {
    const env = new WarehouseEnv(small);
    env.reset(5);
    place(env, [at(2, 1), at(4, 1), at(2, 9), at(2, 13)], [at(20, 1), at(1, 1), at(2, 17), at(2, 17)]);
    env.step(EAST); // robot 0 claims (3,1)
    env.step(WEST); // robot 1 tries (3,1)
    expect(env.collisions).toBe(1);
    expect(env.next[1]).toBe(at(4, 1));
  });

  it('blocks a move into an undecided occupant and a swap', () => {
    const env = new WarehouseEnv(small);
    env.reset(6);
    place(env, [at(2, 1), at(3, 1), at(2, 9), at(2, 13)], [at(20, 1), at(1, 1), at(2, 17), at(2, 17)]);
    // Robot 1 has not decided yet: moving into its cell is conservatively blocked.
    expect(env.resolve(0, EAST).blocked).toBe(true);
    // If robot 1 had already committed to moving into robot 0's cell, moving east would be a swap.
    env.decided[1] = 1;
    env.next[1] = at(2, 1);
    expect(env.resolve(0, EAST).blocked).toBe(true);
    // If instead robot 1 had committed to moving away (north), the cell frees up.
    env.next[1] = at(3, 0);
    expect(env.resolve(0, EAST).blocked).toBe(false);
  });

  it('is deterministic and encodes 252 finite values', () => {
    const play = () => {
      const env = new WarehouseEnv(small);
      env.reset(7);
      const rng = Rng.stream(1, 'w');
      const trace: string[] = [];
      while (!env.isDone()) {
        const v = env.encode();
        expect(v.length).toBe(WAREHOUSE_ENCODING_SIZE);
        expect(v.every(Number.isFinite)).toBe(true);
        env.step(rng.int(5));
        trace.push(`${Array.from(env.pos)}|${env.deliveries}|${env.collisions}`);
      }
      return trace;
    };
    expect(WAREHOUSE_ENCODING_SIZE).toBe(252);
    expect(play()).toEqual(play());
  });
});

describe('warehouse teacher and guard', () => {
  const W = DEFAULT_WAREHOUSE_CONFIG.width;
  const at = (x: number, y: number) => y * W + x;

  it('scores a move into a cell that stays occupied below waiting', () => {
    const setup = (first: number) => {
      const e = new WarehouseEnv(small);
      e.reset(8);
      place(e, [at(4, 1), at(3, 1), at(2, 9), at(2, 13)], [at(20, 1), at(5, 1), at(2, 17), at(2, 17)]);
      e.step(first); // robot 0 decides first
      return new WarehouseTeacher().score(e).scores; // then robot 1, heading east
    };
    const stays = setup(WAIT); // robot 0 stays at (4,1): east is blocked for robot 1
    expect(stays[EAST]).toBeLessThan(stays[WAIT]);
    const leaves = setup(EAST); // robot 0 moves on: east is free and shortens robot 1's path
    expect(leaves[EAST]).toBeGreaterThan(leaves[WAIT]);
  });

  it('is deterministic and a longer window costs no less', () => {
    const env = new WarehouseEnv();
    env.reset(9);
    const t = new WarehouseTeacher();
    const a = t.score(env);
    const b = t.score(env.clone());
    expect(Array.from(a.scores)).toEqual(Array.from(b.scores));
    expect(a.cost).toBe(b.cost);
    expect(new WarehouseTeacher({ window: 16 }).score(env).cost).toBeGreaterThanOrEqual(new WarehouseTeacher({ window: 4 }).score(env).cost);
  });

  it('guard rejects a claimed cell and accepts a free corridor cell', () => {
    const env = new WarehouseEnv(small);
    env.reset(10);
    place(env, [at(2, 1), at(4, 1), at(2, 9), at(2, 13)], [at(20, 1), at(1, 1), at(2, 17), at(2, 17)]);
    env.step(EAST); // robot 0 claims (3,1)
    const guard = new WarehouseGuard();
    expect(guard.check(env, WEST).ok).toBe(false); // robot 1 into the claimed cell
    expect(guard.check(env, EAST).ok).toBe(true); // (5,1) is a free corridor cell
  });

  it('guard costs at most a tenth of the teacher, and the teacher beats greedy', () => {
    const teacher = new WarehouseTeacher();
    const guard = new WarehouseGuard();
    const env = new WarehouseEnv({ timesteps: 40 });
    env.reset(11);
    let g = 0;
    let tc = 0;
    let n = 0;
    while (!env.isDone()) {
      const r = teacher.score(env);
      const a = argmax(r.scores);
      g += guard.check(env, a).cost;
      tc += r.cost;
      n++;
      env.step(a);
    }
    expect(g / n).toBeLessThanOrEqual(tc / n / 10);
    expect(env.collisions).toBe(0);
    const greedyEnv = new WarehouseEnv({ timesteps: 40 });
    greedyEnv.reset(11);
    while (!greedyEnv.isDone()) greedyEnv.step(greedyAction(greedyEnv));
    expect(env.deliveries).toBeGreaterThanOrEqual(greedyEnv.deliveries);
  });
});
