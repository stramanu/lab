import { mean, std } from '../core/stats';
import { checkHypotheses, type HypothesisInputs, type HypothesisResult } from './hypotheses';
import type { ConditionResult } from './runner';

/** Two-sided 97.5% quantiles of Student's t for 1..30 degrees of freedom. */
const T975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
  2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tQuantile975(df: number): number {
  if (df < 1) return NaN;
  return df <= T975.length ? T975[df - 1] : 1.96;
}

export interface Interval {
  mean: number;
  /** Half-width of the 95% t-interval (0 for a single value). */
  ci95: number;
  values: number[];
}

export function tInterval(values: number[]): Interval {
  const n = values.length;
  const m = mean(values);
  return { mean: m, ci95: n > 1 ? (tQuantile975(n - 1) * std(values)) / Math.sqrt(n) : 0, values };
}

export interface RunReport {
  conditions: ConditionResult[];
  trainingEscalation?: number[];
}

export interface AggregatedCondition {
  name: string;
  kind: ConditionResult['kind'];
  params: ConditionResult['params'];
  /** True if the condition does not depend on the trained weights (evaluated once, shared by all runs). */
  shared: boolean;
  score: Interval;
  costPerMove: Interval;
  escalationRate: Interval | null;
  agreementAboveThreshold: Interval | null;
  ece: Interval | null;
}

export interface AggregatedHypothesis extends HypothesisResult {
  /** Runs in which the hypothesis holds, e.g. "3/5". */
  runsConfirmed: string;
}

export interface Aggregate {
  runs: number;
  conditions: AggregatedCondition[];
  hypotheses: AggregatedHypothesis[];
}

const collect = (values: Array<number | null | undefined>): Interval | null => {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length === values.length && v.length > 0 ? tInterval(v) : null;
};

/** Mean condition across runs, shaped like a ConditionResult so the hypothesis checks can run on it. */
function meanCondition(runs: ConditionResult[]): ConditionResult {
  const first = runs[0];
  const avg = (f: (c: ConditionResult) => number | null | undefined) => {
    const v = runs.map(f);
    return v.every((x) => typeof x === 'number') ? mean(v as number[]) : null;
  };
  const ece = avg((c) => c.calibration?.ece);
  return {
    ...first,
    score: { ...first.score, mean: avg((c) => c.score.mean)!, ci95: 0 },
    costPerMove: avg((c) => c.costPerMove)!,
    escalationRate: avg((c) => c.escalationRate),
    agreementAboveThreshold: avg((c) => c.agreementAboveThreshold),
    calibration: ece === null ? null : { ece, bins: [] },
  };
}

/**
 * Aggregates per-run evaluation reports of the same study. Every run must
 * contain the same conditions in the same order. Hypotheses are judged on the
 * across-run means, and the report states in how many runs each one holds.
 */
export function aggregateRuns(
  runs: RunReport[],
  options: Omit<HypothesisInputs, 'conditions' | 'trainingEscalation'>,
  sharedNames: ReadonlySet<string> = new Set(),
): Aggregate {
  if (runs.length === 0) throw new Error('No runs to aggregate');
  const names = runs[0].conditions.map((c) => c.name);
  for (const r of runs) {
    if (r.conditions.map((c) => c.name).join('|') !== names.join('|')) throw new Error('Runs have different conditions');
  }
  const conditions: AggregatedCondition[] = names.map((name, i) => {
    const per = runs.map((r) => r.conditions[i]);
    return {
      name,
      kind: per[0].kind,
      params: per[0].params,
      shared: sharedNames.has(name),
      score: tInterval(per.map((c) => c.score.mean)),
      costPerMove: tInterval(per.map((c) => c.costPerMove)),
      escalationRate: collect(per.map((c) => c.escalationRate)),
      agreementAboveThreshold: collect(per.map((c) => c.agreementAboveThreshold)),
      ece: collect(per.map((c) => c.calibration?.ece)),
    };
  });

  // Element-wise mean of the training escalation curves (all runs share the schedule).
  const curves = runs.map((r) => r.trainingEscalation).filter((c): c is number[] => Array.isArray(c) && c.length > 0);
  const meanCurve = curves.length
    ? curves[0].map((_, k) => mean(curves.map((c) => c[k]).filter((v) => v !== undefined)))
    : undefined;

  const onMean = checkHypotheses({ ...options, conditions: names.map((_, i) => meanCondition(runs.map((r) => r.conditions[i]))), trainingEscalation: meanCurve });
  const perRun = runs.map((r) => checkHypotheses({ ...options, conditions: r.conditions, trainingEscalation: r.trainingEscalation }));
  const hypotheses = onMean.map((h, k) => ({
    ...h,
    runsConfirmed: `${perRun.filter((p) => p[k].confirmed).length}/${runs.length}`,
  }));
  return { runs: runs.length, conditions, hypotheses };
}
