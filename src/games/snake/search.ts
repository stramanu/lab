import { DX, DY } from './config';
import type { SnakeEnv } from './env';

/** Counts expanded nodes: the unit of compute cost for the Snake planner. */
export interface CostCounter {
  nodes: number;
}

/** Scratch buffers reused across searches (generation stamps avoid clearing). */
class Scratch {
  queue: Int32Array;
  dist: Int32Array;
  stamp: Uint32Array;
  gen = 0;

  constructor(size: number) {
    this.queue = new Int32Array(size);
    this.dist = new Int32Array(size);
    this.stamp = new Uint32Array(size);
  }

  next(): number {
    this.gen = (this.gen + 1) >>> 0;
    if (this.gen === 0) {
      this.stamp.fill(0);
      this.gen = 1;
    }
    return this.gen;
  }
}

let scratch = new Scratch(400);
function getScratch(size: number): Scratch {
  if (scratch.queue.length < size) scratch = new Scratch(size);
  return scratch;
}

/**
 * BFS from `from` over free cells. Returns the distance to `target` or -1 if unreachable.
 * The target cell counts as passable even if occupied (used for the tail).
 * With `target = -1` it explores everything and returns the number of reached cells (flood fill).
 */
function bfs(env: SnakeEnv, from: number, target: number, counter: CostCounter): number {
  const s = getScratch(env.cells);
  const gen = s.next();
  const { queue, dist, stamp } = s;
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  stamp[from] = gen;
  dist[from] = 0;
  let reached = 0;
  while (head < tail) {
    const c = queue[head++];
    counter.nodes++;
    const cx = env.x(c);
    const cy = env.y(c);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!env.inBounds(nx, ny)) continue;
      const n = env.index(nx, ny);
      if (stamp[n] === gen) continue;
      if (n === target) return dist[c] + 1;
      if (env.occ[n]) continue;
      stamp[n] = gen;
      dist[n] = dist[c] + 1;
      queue[tail++] = n;
      reached++;
    }
  }
  return target === -1 ? reached : -1;
}

/** Shortest-path distance from the head to the food, or -1 if unreachable. */
export function distanceToFood(env: SnakeEnv, counter: CostCounter): number {
  if (env.food < 0) return -1;
  return bfs(env, env.head(), env.food, counter);
}

/** True if the tail can be reached from the head (the snake can keep following itself). */
export function tailReachable(env: SnakeEnv, counter: CostCounter): boolean {
  if (env.length < 2) return true;
  return bfs(env, env.head(), env.tail(), counter) >= 0;
}

/** Number of free cells reachable from the head. */
export function reachableArea(env: SnakeEnv, counter: CostCounter): number {
  return bfs(env, env.head(), -1, counter);
}
