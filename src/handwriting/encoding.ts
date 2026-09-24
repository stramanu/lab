import { NUM_POINTS, type PointCloud } from './preprocess';

export type HandwritingEncoding = 'trajectory' | 'raster';

export const RASTER_SIDE = 16;
export const ENCODING_SIZE: Record<HandwritingEncoding, number> = {
  trajectory: NUM_POINTS * 5,
  raster: RASTER_SIDE * RASTER_SIDE,
};

/**
 * Trajectory encoding (160 values): for each point, x, y, the local writing direction
 * (cos θ, sin θ, from the neighbouring points of the same stroke) and a stroke-start flag.
 */
export function encodeTrajectory(p: PointCloud, out = new Float32Array(ENCODING_SIZE.trajectory)): Float32Array {
  const n = p.x.length;
  for (let k = 0; k < n; k++) {
    const prev = k > 0 && p.stroke[k - 1] === p.stroke[k] ? k - 1 : k;
    const next = k < n - 1 && p.stroke[k + 1] === p.stroke[k] ? k + 1 : k;
    const dx = p.x[next] - p.x[prev];
    const dy = p.y[next] - p.y[prev];
    const len = Math.hypot(dx, dy);
    const o = k * 5;
    out[o] = p.x[k];
    out[o + 1] = p.y[k];
    out[o + 2] = len > 0 ? dx / len : 0;
    out[o + 3] = len > 0 ? dy / len : 0;
    out[o + 4] = k === 0 || p.stroke[k] !== p.stroke[k - 1] ? 1 : 0;
  }
  return out;
}

/**
 * Raster encoding (256 values): the resampled polyline of each stroke drawn on a 16×16 grid over
 * [−1, 1]², by bilinear splatting of samples every 0.2 cells; each cell holds the ink coverage, clamped to [0, 1].
 */
export function encodeRaster(p: PointCloud, out = new Float32Array(ENCODING_SIZE.raster)): Float32Array {
  out.fill(0);
  const S = RASTER_SIDE;
  const toGrid = (v: number) => ((v + 1) / 2) * (S - 1);
  const splat = (gx: number, gy: number) => {
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const add = (x: number, y: number, w: number) => {
      if (x >= 0 && x < S && y >= 0 && y < S) out[y * S + x] += 0.35 * w;
    };
    add(x0, y0, (1 - fx) * (1 - fy));
    add(x0 + 1, y0, fx * (1 - fy));
    add(x0, y0 + 1, (1 - fx) * fy);
    add(x0 + 1, y0 + 1, fx * fy);
  };
  const n = p.x.length;
  for (let k = 0; k < n; k++) {
    const sameStroke = k > 0 && p.stroke[k] === p.stroke[k - 1];
    if (!sameStroke) {
      splat(toGrid(p.x[k]), toGrid(p.y[k]));
      continue;
    }
    const ax = toGrid(p.x[k - 1]);
    const ay = toGrid(p.y[k - 1]);
    const bx = toGrid(p.x[k]);
    const by = toGrid(p.y[k]);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.2));
    for (let i = 1; i <= steps; i++) splat(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
  }
  for (let i = 0; i < out.length; i++) if (out[i] > 1) out[i] = 1;
  return out;
}

export function encode(p: PointCloud, encoding: HandwritingEncoding): Float32Array {
  return encoding === 'trajectory' ? encodeTrajectory(p) : encodeRaster(p);
}
