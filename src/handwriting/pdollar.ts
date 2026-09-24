/**
 * The $P point-cloud recogniser (Vatavu, Anthony & Wobbrock, "Gestures as Point Clouds:
 * A $P Recognizer for User Interface Prototypes", ICMI 2012), following the paper's pseudocode:
 * resample to n = 32 points, scale by the larger side, translate to the centroid, then a greedy
 * cloud match started every ⌊n^(1−ε)⌋ points (ε = 0.5) in both directions, with decreasing weights.
 */
import type { Sample } from './data';
import { NUM_POINTS, resampleStrokes, strokePairs } from './preprocess';
import type { Candidate, Recognition } from './recognizer';

/** Operations counted per point-to-point distance: 2 subtractions, 2 multiplications, 1 addition (the square root is not counted). */
export const OPS_PER_DISTANCE = 5;

export interface PCloud {
  x: Float64Array;
  y: Float64Array;
}

export interface PTemplate extends PCloud {
  label: number;
}

/** $P normalisation of a character given as flat stroke arrays. */
export function pdollarCloud(strokes: number[][], n = NUM_POINTS): PCloud {
  const p = resampleStrokes(strokePairs(strokes), n);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, p.x[i]);
    maxX = Math.max(maxX, p.x[i]);
    minY = Math.min(minY, p.y[i]);
    maxY = Math.max(maxY, p.y[i]);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    x[i] = (p.x[i] - minX) / size;
    y[i] = (p.y[i] - minY) / size;
    cx += x[i];
    cy += y[i];
  }
  cx /= n;
  cy /= n;
  for (let i = 0; i < n; i++) {
    x[i] -= cx;
    y[i] -= cy;
  }
  return { x, y };
}

/** CLOUD-DISTANCE: greedy matching from `start`, weights decreasing with the matching order. */
function cloudDistance(a: PCloud, b: PCloud, start: number, counter: { distances: number }): number {
  const n = a.x.length;
  const matched = new Uint8Array(n);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity;
    let index = -1;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const dx = a.x[i] - b.x[j];
      const dy = a.y[i] - b.y[j];
      const d = Math.sqrt(dx * dx + dy * dy);
      counter.distances++;
      if (d < min) {
        min = d;
        index = j;
      }
    }
    matched[index] = 1;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/** GREEDY-CLOUD-MATCH with ε = 0.5. */
export function greedyCloudMatch(points: PCloud, template: PCloud, counter = { distances: 0 }): number {
  const n = points.x.length;
  const step = Math.floor(Math.pow(n, 1 - 0.5));
  let min = Infinity;
  for (let i = 0; i < n; i += step) {
    min = Math.min(min, cloudDistance(points, template, i, counter), cloudDistance(template, points, i, counter));
  }
  return min;
}

/** $P with every training sample as a template: a nearest-neighbour classifier over point clouds. */
export class PDollarRecognizer {
  readonly templates: PTemplate[];

  constructor(templates: PTemplate[]) {
    this.templates = templates;
  }

  static fromSamples(samples: Sample[]): PDollarRecognizer {
    return new PDollarRecognizer(samples.map((s) => ({ ...pdollarCloud(s.strokes), label: s.label })));
  }

  /** The k nearest distinct letters by cloud distance; cost in arithmetic operations. */
  recognize(strokes: number[][], k = 3): Recognition {
    const cloud = pdollarCloud(strokes);
    const counter = { distances: 0 };
    const best = new Map<number, number>();
    for (const t of this.templates) {
      const d = greedyCloudMatch(cloud, t, counter);
      if (d < (best.get(t.label) ?? Infinity)) best.set(t.label, d);
    }
    const top: Candidate[] = [...best]
      .map(([label, score]) => ({ label, score }))
      .sort((a, b) => a.score - b.score || a.label - b.label)
      .slice(0, k);
    return { top, cost: counter.distances * OPS_PER_DISTANCE };
  }
}
