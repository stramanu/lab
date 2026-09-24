import { DX, DY } from './config';
import type { WarehouseEnv } from './env';
import { walkable } from './layout';

const R = 4; // 9×9 window
const SIDE = 2 * R + 1;
export const WAREHOUSE_ENCODING_SIZE = SIDE * SIDE * 3 + 3 + 4 + 2; // 252

/** Egocentric encoding of the deciding robot (absolute axes). */
export function encodeWarehouse(env: WarehouseEnv, out?: Float32Array): Float32Array {
  const v = out ?? new Float32Array(WAREHOUSE_ENCODING_SIZE);
  v.fill(0);
  const l = env.layout;
  const W = l.width;
  const r = env.current;
  const p = env.pos[r];
  const px = p % W;
  const py = (p / W) | 0;
  const g = env.goal[r];
  let others = 0;
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      const x = px + i - R;
      const y = py + j - R;
      const base = (j * SIDE + i) * 3;
      if (!walkable(l, x, y)) {
        v[base] = 1;
        continue;
      }
      const c = y * W + x;
      if (env.occ[c] && env.occ[c] - 1 !== r) {
        v[base + 1] = 1;
        others++;
      }
      if (c === g) v[base + 2] = 1;
    }
  }
  let k = SIDE * SIDE * 3;
  const gx = (g % W) - px;
  const gy = ((g / W) | 0) - py;
  const norm = Math.hypot(gx, gy) || 1;
  v[k++] = gx / norm;
  v[k++] = gy / norm;
  const d = env.distances(r);
  v[k++] = Math.min(1, d[p] / (l.width + l.height));
  for (let a = 1; a <= 4; a++) {
    const x = px + DX[a];
    const y = py + DY[a];
    v[k++] = walkable(l, x, y) ? Math.max(-1, Math.min(1, d[y * W + x] - d[p])) : 1;
  }
  v[k++] = others / Math.max(1, env.n - 1);
  v[k++] = env.t / env.config.timesteps;
  return v;
}
