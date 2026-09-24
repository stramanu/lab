import type { Guard, GuardResult, Teacher, TeacherResult } from '../../core/types';
import { DX, DY, EAST, NORTH, SOUTH, WAIT, WEST } from './config';
import type { WarehouseEnv } from './env';
import { walkable } from './layout';

const MOVE_ORDER = [NORTH, EAST, SOUTH, WEST] as const;

/** Distance-map step for robot r ignoring other robots (wait at the goal or if no step improves). */
function descentStep(env: WarehouseEnv, r: number, from: number): number {
  const d = env.distances(r);
  const W = env.layout.width;
  let best = WAIT;
  let bestD = d[from];
  for (const a of MOVE_ORDER) {
    const x = (from % W) + DX[a];
    const y = ((from / W) | 0) + DY[a];
    if (!walkable(env.layout, x, y)) continue;
    const nd = d[y * W + x];
    if (nd < bestD) {
      bestD = nd;
      best = a;
    }
  }
  return best;
}

function moveCell(env: WarehouseEnv, from: number, a: number): number {
  if (a === WAIT) return from;
  const W = env.layout.width;
  return ((from / W) | 0) * W + DY[a] * W + (from % W) + DX[a];
}

/**
 * Hand-written greedy baseline: the unblocked action with the lowest
 * distance-to-goal (moves in N, E, S, W order), waiting unless a move strictly helps.
 */
export function greedyAction(env: WarehouseEnv): number {
  const r = env.current;
  const d = env.distances(r);
  let best = WAIT;
  let bestD = d[env.pos[r]];
  for (const a of MOVE_ORDER) {
    const { target, blocked } = env.resolve(r, a);
    if (blocked) continue;
    if (d[target] < bestD) {
      bestD = d[target];
      best = a;
    }
  }
  return best;
}

export interface WarehouseTeacherConfig {
  /** Planning window in timesteps: the cost knob. */
  window: number;
}

const BLOCKED_SCORE = -1000;
const PREFERENCE: Record<number, number> = { [NORTH]: 0.08, [EAST]: 0.06, [SOUTH]: 0.04, [WEST]: 0.02, [WAIT]: 0 };

/**
 * System Two for the warehouse: stateless cooperative space-time search (after
 * Silver 2005). Other robots' trajectories are predicted over the window (claimed
 * next cells for robots that already decided, distance-map descent otherwise);
 * each action of the deciding robot is scored by the length of the shortest
 * space-time path to its goal that avoids them, with the distance map beyond
 * the window. Cost = search nodes + predicted trajectory steps.
 */
export class WarehouseTeacher implements Teacher {
  readonly name: string;
  readonly config: WarehouseTeacherConfig;
  private stamp: Uint32Array = new Uint32Array(0);
  private gen = 0;

  constructor(config: Partial<WarehouseTeacherConfig> = {}) {
    this.config = { window: 8, ...config };
    this.name = `warehouse-coop-w${this.config.window}`;
  }

  score(env: WarehouseEnv): TeacherResult {
    const Wn = this.config.window;
    const cells = env.layout.width * env.layout.height;
    const r = env.current;
    let cost = 0;

    // Predicted trajectories of the other robots: reserved[τ][cell], and moves (from → to) at each τ.
    const reserved = Array.from({ length: Wn + 1 }, () => new Uint8Array(cells));
    const moves: Array<Map<number, number>> = Array.from({ length: Wn + 1 }, () => new Map());
    for (let o = 0; o < env.n; o++) {
      if (o === r) continue;
      let c = env.pos[o];
      reserved[0][c] = 1;
      for (let tau = 1; tau <= Wn; tau++) {
        const nextCell = tau === 1 && env.decided[o] ? env.next[o] : moveCell(env, c, descentStep(env, o, c));
        if (nextCell !== c) moves[tau].set(nextCell, c);
        c = nextCell;
        reserved[tau][c] = 1;
        cost++;
      }
    }

    const d = env.distances(r);
    const goal = env.goal[r];
    const scores = new Float64Array(5);
    const greedy = greedyAction(env);
    for (let a = 0; a < 5; a++) {
      const { target, blocked } = env.resolve(r, a);
      if (blocked) {
        scores[a] = BLOCKED_SCORE;
        continue;
      }
      const { length, nodes } = this.search(env, target, goal, d, reserved, moves);
      cost += nodes;
      scores[a] = -length + (a === greedy ? 0.3 : 0) + PREFERENCE[a];
    }
    return { scores, cost: Math.max(1, cost) };
  }

  /** Time-layered breadth-first search from `start` at τ = 1. */
  private search(env: WarehouseEnv, start: number, goal: number, d: Int16Array, reserved: Uint8Array[], moves: Array<Map<number, number>>): { length: number; nodes: number } {
    if (start === goal) return { length: 1, nodes: 1 };
    const Wn = this.config.window;
    const cells = env.layout.width * env.layout.height;
    if (this.stamp.length !== cells * (Wn + 1)) this.stamp = new Uint32Array(cells * (Wn + 1));
    this.gen = (this.gen + 1) >>> 0 || 1;
    const W = env.layout.width;
    let frontier = [start];
    let nodes = 0;
    for (let tau = 1; tau < Wn; tau++) {
      const next: number[] = [];
      for (const c of frontier) {
        nodes++;
        const x = c % W;
        const y = (c / W) | 0;
        for (let a = 0; a < 5; a++) {
          const nx = x + DX[a];
          const ny = y + DY[a];
          if (!walkable(env.layout, nx, ny)) continue;
          const n = ny * W + nx;
          if (reserved[tau + 1][n]) continue;
          if (n !== c && moves[tau + 1].get(c) === n) continue; // swap with a predicted move n → c
          if (n === goal) return { length: tau + 1, nodes };
          const key = (tau + 1) * cells + n;
          if (this.stamp[key] === this.gen) continue;
          this.stamp[key] = this.gen;
          next.push(n);
        }
      }
      if (!next.length) return { length: Wn + 100, nodes };
      frontier = next;
    }
    let best = Infinity;
    for (const c of frontier) best = Math.min(best, d[c]);
    return { length: Wn + best, nodes: nodes + frontier.length };
  }
}

/** Near-free check: environment conflicts, and dead-end cells that are not the goal. */
export class WarehouseGuard implements Guard {
  readonly name = 'warehouse-conflict-guard';

  check(env: WarehouseEnv, a: number): GuardResult {
    const r = env.current;
    const { target, blocked } = env.resolve(r, a);
    if (blocked) return { ok: false, cost: 1 };
    if (a === WAIT || target === env.goal[r]) return { ok: true, cost: 1 };
    const W = env.layout.width;
    let exits = 0;
    for (const m of MOVE_ORDER) if (walkable(env.layout, (target % W) + DX[m], ((target / W) | 0) + DY[m])) exits++;
    return { ok: exits > 1, cost: 5 };
  }
}
