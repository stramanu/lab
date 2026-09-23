import { Rng } from '../../core/rng';
import type { RacingConfig } from './config';

/** A closed centreline sampled every metre, with tangents and signed curvature (positive = left turn). */
export interface Track {
  n: number;
  /** Total length (m); points are `length / n` apart (≈ 1 m). */
  length: number;
  spacing: number;
  x: Float64Array;
  y: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  kappa: Float64Array;
  width: number;
}

const DENSE = 6000;
const HARMONICS = [
  { k: 2, amp: 0.14 },
  { k: 3, amp: 0.1 },
  { k: 4, amp: 0.06 },
  { k: 5, amp: 0.035 },
];

/**
 * Star-shaped loop r(θ) = R0 · (1 + Σ a_k sin(kθ + φ_k)). With Σ a_k < 1 the
 * radius stays positive, so the curve cannot self-intersect. Resampled to
 * uniform ~1 m spacing; direction of travel chosen by the seed.
 */
export function generateTrack(seed: number, cfg: RacingConfig): Track {
  const rng = Rng.stream(seed, 'racing-track');
  const terms = HARMONICS.map((h) => ({ k: h.k, a: h.amp * (0.4 + 0.6 * rng.next()), phase: rng.next() * Math.PI * 2 }));
  const reverse = rng.next() < 0.5;

  const dx = new Float64Array(DENSE + 1);
  const dy = new Float64Array(DENSE + 1);
  const ds = new Float64Array(DENSE + 1);
  for (let i = 0; i <= DENSE; i++) {
    const th = ((reverse ? DENSE - i : i) / DENSE) * Math.PI * 2;
    let r = 1;
    for (const t of terms) r += t.a * Math.sin(t.k * th + t.phase);
    dx[i] = cfg.radius * r * Math.cos(th);
    dy[i] = cfg.radius * r * Math.sin(th);
    if (i > 0) ds[i] = ds[i - 1] + Math.hypot(dx[i] - dx[i - 1], dy[i] - dy[i - 1]);
  }
  const length = ds[DENSE];
  const n = Math.round(length);
  const spacing = length / n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * spacing;
    while (ds[j + 1] < s) j++;
    const t = (s - ds[j]) / (ds[j + 1] - ds[j] || 1);
    x[i] = dx[j] + (dx[j + 1] - dx[j]) * t;
    y[i] = dy[j] + (dy[j + 1] - dy[j]) * t;
  }
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const kappa = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n;
    const q = (i + 1) % n;
    const ax = x[q] - x[p];
    const ay = y[q] - y[p];
    const len = Math.hypot(ax, ay) || 1;
    tx[i] = ax / len;
    ty[i] = ay / len;
  }
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n;
    const q = (i + 1) % n;
    // Signed curvature from the change of heading over two spacings.
    const cross = tx[p] * ty[q] - ty[p] * tx[q];
    const dot = tx[p] * tx[q] + ty[p] * ty[q];
    kappa[i] = Math.atan2(cross, dot) / (2 * spacing);
  }
  return { n, length, spacing, x, y, tx, ty, kappa, width: cfg.trackWidth };
}

export const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Index of the centreline point nearest to (px, py), searched around a hint. */
export function nearestIndex(track: Track, px: number, py: number, hint: number, window = 25): number {
  let best = hint;
  let bestD = Infinity;
  for (let k = -window; k <= window; k++) {
    const i = wrap(hint + k, track.n);
    const d = (track.x[i] - px) ** 2 + (track.y[i] - py) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Signed lateral offset of (px, py) from centreline point i (positive = left of the direction of travel). */
export function lateralOffset(track: Track, i: number, px: number, py: number): number {
  return track.tx[i] * (py - track.y[i]) - track.ty[i] * (px - track.x[i]);
}

/** Largest |curvature| over the next `distance` metres from index i. */
export function maxCurvatureAhead(track: Track, i: number, distance: number): number {
  const steps = Math.max(1, Math.round(distance / track.spacing));
  let m = 0;
  for (let k = 0; k <= steps; k++) m = Math.max(m, Math.abs(track.kappa[wrap(i + k, track.n)]));
  return m;
}
