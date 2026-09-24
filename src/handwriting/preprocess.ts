import type { Rng } from '../core/rng';

/** Number of resampled points per character (as in $P, Vatavu et al. 2012). */
export const NUM_POINTS = 32;

/** A resampled character: N points and the index of the stroke each one lies on. */
export interface PointCloud {
  x: Float64Array;
  y: Float64Array;
  stroke: Int32Array;
}

/** Strokes as arrays of [x, y] pairs, the working format of this module. */
type Strokes = Array<Array<[number, number]>>;

function toPairs(strokes: number[][]): Strokes {
  return strokes.map((s) => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < s.length; i += 2) out.push([s[i], s[i + 1]]);
    return out;
  });
}

/** Centres the bounding box at the origin and scales its larger side to span [−1, 1]; the aspect ratio is kept. */
function normalise(strokes: Strokes): Strokes {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
  return strokes.map((s) => s.map(([x, y]) => [(x - cx) / half, (y - cy) / half] as [number, number]));
}

/** Resamples to n points equidistant along the ink; pen-up jumps between strokes are not ink. */
export function resampleStrokes(strokes: Strokes, n = NUM_POINTS): PointCloud {
  const segs: Array<{ x0: number; y0: number; x1: number; y1: number; len: number; stroke: number }> = [];
  let total = 0;
  strokes.forEach((s, k) => {
    for (let i = 1; i < s.length; i++) {
      const len = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      segs.push({ x0: s[i - 1][0], y0: s[i - 1][1], x1: s[i][0], y1: s[i][1], len, stroke: k });
      total += len;
    }
  });
  const out: PointCloud = { x: new Float64Array(n), y: new Float64Array(n), stroke: new Int32Array(n) };
  const first = strokes.find((s) => s.length > 0);
  if (total === 0 || !first) {
    // A dot (or nothing): every point sits on the first recorded point.
    const [x, y] = first?.[0] ?? [0, 0];
    out.x.fill(x);
    out.y.fill(y);
    return out;
  }
  let seg = 0;
  let before = 0; // ink length before segment `seg`
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg < segs.length - 1 && before + segs[seg].len < target) before += segs[seg++].len;
    const s = segs[seg];
    const t = s.len > 0 ? Math.min(1, Math.max(0, (target - before) / s.len)) : 0;
    out.x[k] = s.x0 + t * (s.x1 - s.x0);
    out.y[k] = s.y0 + t * (s.y1 - s.y0);
    out.stroke[k] = s.stroke;
  }
  return out;
}

/**
 * Training augmentation, applied to normalised strokes before resampling: rotation in [−10°, 10°],
 * independent x/y scaling in [0.85, 1.15], shear in [−0.2, 0.2], Gaussian point jitter (σ = 0.01).
 * Affine distortions are standard for handwriting (Simard, Steinkraus & Platt 2003); their elastic distortions are not used.
 */
function augment(strokes: Strokes, rng: Rng): Strokes {
  const angle = ((rng.next() * 2 - 1) * 10 * Math.PI) / 180;
  const sx = 0.85 + rng.next() * 0.3;
  const sy = 0.85 + rng.next() * 0.3;
  const shear = (rng.next() * 2 - 1) * 0.2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return strokes.map((stroke) =>
    stroke.map(([x, y]) => {
      const xs = (x + shear * y) * sx;
      const ys = y * sy;
      return [c * xs - s * ys + rng.normal() * 0.01, s * xs + c * ys + rng.normal() * 0.01] as [number, number];
    }),
  );
}

/**
 * Preprocessing shared by the MLP encodings: normalise, optionally augment (training only)
 * and re-normalise, then resample to 32 points.
 */
export function preprocess(strokes: number[][], rng?: Rng): PointCloud {
  let s = normalise(toPairs(strokes));
  if (rng) s = normalise(augment(s, rng));
  return resampleStrokes(s);
}

/** Strokes as [x, y] pairs, for recognisers with their own normalisation ($P). */
export function strokePairs(strokes: number[][]): Array<Array<[number, number]>> {
  return toPairs(strokes);
}
