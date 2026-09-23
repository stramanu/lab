import { DX, DY } from './config';
import type { SnakeEnv } from './env';

export const SNAKE_WINDOW = 7;
const HALF = SNAKE_WINDOW >> 1;
export const CELL_EMPTY = 0;
export const CELL_BODY = 1;
export const CELL_WALL = 2;
export const CELL_FOOD = 3;
const CATEGORIES = 4;
const WINDOW_VALUES = SNAKE_WINDOW * SNAKE_WINDOW * CATEGORIES;
/** 196 window values + 4 food-direction values + 1 normalized length. */
export const SNAKE_ENCODING_SIZE = WINDOW_VALUES + 4 + 1;

/**
 * Egocentric encoding: a 7x7 window centered on the head and rotated so that
 * "ahead" is always the top row, one-hot over (empty, body, wall, food), plus
 * the food direction in the same frame and the normalized length.
 * Rotating the whole scene leaves the encoding unchanged.
 */
export function encodeSnake(env: SnakeEnv, out?: Float32Array): Float32Array {
  const v = out ?? new Float32Array(SNAKE_ENCODING_SIZE);
  v.fill(0);
  const h = env.head();
  const hx = env.x(h);
  const hy = env.y(h);
  const fx = DX[env.heading];
  const fy = DY[env.heading];
  const right = (env.heading + 1) & 3;
  const rx = DX[right];
  const ry = DY[right];

  for (let i = 0; i < SNAKE_WINDOW; i++) {
    const fwd = HALF - i;
    for (let j = 0; j < SNAKE_WINDOW; j++) {
      const lat = j - HALF;
      const x = hx + fx * fwd + rx * lat;
      const y = hy + fy * fwd + ry * lat;
      let cat = CELL_EMPTY;
      if (!env.inBounds(x, y)) cat = CELL_WALL;
      else {
        const c = env.index(x, y);
        if (env.occ[c]) cat = CELL_BODY;
        else if (c === env.food) cat = CELL_FOOD;
      }
      v[(i * SNAKE_WINDOW + j) * CATEGORIES + cat] = 1;
    }
  }

  if (env.food >= 0) {
    const dx = env.x(env.food) - hx;
    const dy = env.y(env.food) - hy;
    const along = dx * fx + dy * fy;
    const lateral = dx * rx + dy * ry;
    const norm = env.width + env.height;
    v[WINDOW_VALUES + 0] = Math.max(along, 0) / norm;
    v[WINDOW_VALUES + 1] = Math.max(-along, 0) / norm;
    v[WINDOW_VALUES + 2] = Math.max(-lateral, 0) / norm;
    v[WINDOW_VALUES + 3] = Math.max(lateral, 0) / norm;
  }
  v[WINDOW_VALUES + 4] = env.length / env.cells;
  return v;
}

/** Category of the window cell at (row, col), for tests and debugging. */
export function windowCategory(encoding: Float32Array, row: number, col: number): number {
  const base = (row * SNAKE_WINDOW + col) * CATEGORIES;
  for (let k = 0; k < CATEGORIES; k++) if (encoding[base + k] === 1) return k;
  return -1;
}
