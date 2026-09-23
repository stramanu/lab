import type { AggregatedCondition } from '../src/eval/aggregate';

/** Shape of a published multi-run study (`artifacts/<game>/study/study-<split>-<n>.json`). */
export interface StudyFile {
  game: string;
  split: string;
  runs: number;
  seeds: { count: number; first: number; last: number };
  conditions: AggregatedCondition[];
}

export type FrontierKind = 'system2' | 'hybrid' | 'hybrid+guard' | 'baseline' | 'other';

export interface FrontierPoint {
  label: string;
  kind: FrontierKind;
  /** Mean cost per move across runs (compute units). */
  cost: number;
  /** Mean score across runs. */
  score: number;
  /** Half-width of the 95% t-interval of the score across runs (0 for shared conditions). */
  ci95: number;
  /** True when the cost is 0 and the point must be pinned to the left edge of a log axis. */
  zeroCost: boolean;
}

function kindOf(c: AggregatedCondition): FrontierKind {
  if (c.kind === 'system2') return 'system2';
  if (c.kind === 'baseline') return 'baseline';
  if (c.kind === 'hybrid' && c.name !== 'guard only') return c.params.guard !== undefined ? 'hybrid+guard' : 'hybrid';
  return 'other';
}

/** One point per condition of the study. */
export function frontierPoints(study: StudyFile): FrontierPoint[] {
  return study.conditions.map((c) => ({
    label: c.name,
    kind: kindOf(c),
    cost: c.costPerMove.mean,
    score: c.score.mean,
    ci95: c.score.ci95,
    zeroCost: c.costPerMove.mean <= 0,
  }));
}

/** The planner condition used as reference (the teacher's knob level). */
export function referencePoint(points: FrontierPoint[], level: number): FrontierPoint | undefined {
  return points.find((p) => p.label === `system2 (level ${level})`);
}

/** Log-axis domain covering every non-zero cost, padded to whole decades. */
export function costDomain(points: FrontierPoint[]): [number, number] {
  const costs = points.filter((p) => !p.zeroCost).map((p) => p.cost);
  const lo = 10 ** Math.floor(Math.log10(Math.min(...costs, 1)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...costs, 10)));
  return [lo, hi];
}

/** Score domain from 0 to a rounded value above the best upper interval bound. */
export function scoreDomain(points: FrontierPoint[]): [number, number] {
  const top = Math.max(...points.map((p) => p.score + p.ci95), 1);
  const step = 10 ** Math.floor(Math.log10(top));
  return [0, Math.ceil((top * 1.05) / step) * step];
}
