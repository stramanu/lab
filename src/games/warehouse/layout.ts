import type { WarehouseConfig } from './config';
import { DX, DY } from './config';

/** Static warehouse layout: shelves (blocked), stations and shelf-access cells, plus cached distance maps. */
export interface Layout {
  width: number;
  height: number;
  /** 1 = shelf or wall (not walkable). */
  blocked: Uint8Array;
  stations: number[];
  shelfAccess: number[];
  /** BFS distance maps to each goal cell, computed on demand. */
  distances: Map<number, Int16Array>;
}

const cache = new Map<string, Layout>();

/**
 * 2 × 6 shelf blocks in five rows and three columns, separated by 1-cell aisles
 * vertically and 2-cell aisles horizontally, with perimeter corridors. The outer
 * columns are walls except for ten stations.
 */
export function makeLayout(cfg: WarehouseConfig): Layout {
  const key = `${cfg.width}x${cfg.height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { width: W, height: H } = cfg;
  const blocked = new Uint8Array(W * H);
  const idx = (x: number, y: number) => y * W + x;
  for (let y = 0; y < H; y++) {
    blocked[idx(0, y)] = 1;
    blocked[idx(W - 1, y)] = 1;
  }
  const blockX = [4, 12, 20];
  const blockY = [2, 5, 8, 11, 14];
  for (const bx of blockX) for (const by of blockY) for (let dx = 0; dx < 6; dx++) for (let dy = 0; dy < 2; dy++) blocked[idx(bx + dx, by + dy)] = 1;
  const stations: number[] = [];
  for (const y of [3, 6, 9, 12, 15]) {
    for (const x of [0, W - 1]) {
      blocked[idx(x, y)] = 0;
      stations.push(idx(x, y));
    }
  }
  const shelfAccess: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const c = idx(x, y);
      if (blocked[c]) continue;
      let nextToShelf = false;
      for (let a = 1; a <= 4; a++) {
        const nx = x + DX[a];
        const ny = y + DY[a];
        if (nx > 0 && nx < W - 1 && ny >= 0 && ny < H && blocked[idx(nx, ny)]) nextToShelf = true;
      }
      if (nextToShelf) shelfAccess.push(c);
    }
  }
  const layout: Layout = { width: W, height: H, blocked, stations, shelfAccess, distances: new Map() };
  cache.set(key, layout);
  return layout;
}

export function walkable(l: Layout, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < l.width && y < l.height && !l.blocked[y * l.width + x];
}

/** Shortest-path distance map to `goal` (BFS over walkable cells); unreachable = 32767. Cached. */
export function distanceMap(l: Layout, goal: number): Int16Array {
  const hit = l.distances.get(goal);
  if (hit) return hit;
  const d = new Int16Array(l.width * l.height).fill(32767);
  const queue = new Int32Array(l.width * l.height);
  let head = 0;
  let tail = 0;
  d[goal] = 0;
  queue[tail++] = goal;
  while (head < tail) {
    const c = queue[head++];
    const x = c % l.width;
    const y = (c / l.width) | 0;
    for (let a = 1; a <= 4; a++) {
      const nx = x + DX[a];
      const ny = y + DY[a];
      if (!walkable(l, nx, ny)) continue;
      const n = ny * l.width + nx;
      if (d[n] <= d[c] + 1) continue;
      d[n] = d[c] + 1;
      queue[tail++] = n;
    }
  }
  l.distances.set(goal, d);
  return d;
}
