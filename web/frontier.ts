import type { ConditionResult, EvalReport } from '../src/eval';

export type FrontierKind = 'system2' | 'hybrid' | 'hybrid+guard' | 'other';

export interface FrontierPoint {
  label: string;
  kind: FrontierKind;
  /** Mean cost per move (compute units). */
  cost: number;
  /** Mean score. */
  score: number;
  ci95: number;
  /** True when the cost is 0 and the point must be pinned to the left edge of a log axis. */
  zeroCost: boolean;
}

function kindOf(c: ConditionResult): FrontierKind {
  if (c.kind === 'system2') return 'system2';
  if (c.kind === 'hybrid' && c.name !== 'guard only') return c.params.guard !== undefined ? 'hybrid+guard' : 'hybrid';
  return 'other';
}

/** One point per condition of the report. */
export function frontierPoints(report: EvalReport): FrontierPoint[] {
  return report.conditions.map((c) => ({
    label: c.name,
    kind: kindOf(c),
    cost: c.costPerMove,
    score: c.score.mean,
    ci95: c.score.ci95,
    zeroCost: c.costPerMove <= 0,
  }));
}

/** Log-axis domain covering every non-zero cost, padded to whole decades. */
export function costDomain(points: FrontierPoint[]): [number, number] {
  const costs = points.filter((p) => !p.zeroCost).map((p) => p.cost);
  const lo = 10 ** Math.floor(Math.log10(Math.min(...costs, 1)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...costs, 10)));
  return [lo, hi];
}
