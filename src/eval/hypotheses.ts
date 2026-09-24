import type { ConditionResult } from './runner';

export interface HypothesisResult {
  id: 'H1' | 'H2' | 'H3' | 'H4';
  statement: string;
  target: string;
  measured: string;
  confirmed: boolean;
  details: Record<string, number | string | null>;
}

export interface HypothesisInputs {
  conditions: ConditionResult[];
  /** Escalation rates of the training escalation iterations, in order. */
  trainingEscalation?: number[];
  /** Cost-knob level of the teacher used in training (reference System Two). */
  referenceLevel: number;
  /** Threshold at which H4 is measured. */
  referenceThreshold?: number;
  /** Primary confidence measure. */
  measure?: string;
}

/** Targets are fixed here and never adjusted to the results. */
export const TARGETS = {
  h1MaxEscalation: 0.1,
  h2MinScoreRatio: 0.9,
  h2MinCostRatio: 10,
  h3MinScoreRatio: 0.6,
  h4MinAgreement: 0.95,
} as const;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function checkHypotheses(input: HypothesisInputs): HypothesisResult[] {
  const measure = input.measure ?? 'maxProb';
  const refThreshold = input.referenceThreshold ?? 0.9;
  const s2 = input.conditions.find((c) => c.kind === 'system2' && c.params.level === input.referenceLevel);
  const s1 = input.conditions.find((c) => c.kind === 'system1');
  const allHybrids = input.conditions.filter((c) => c.kind === 'hybrid');
  // H4 measures the student's own calibration: the unguarded primary hybrid.
  const hybrids = allHybrids.filter((c) => c.params.confidence === measure && c.params.guard === undefined);
  const results: HypothesisResult[] = [];

  // H1: escalation falls during training and settles below 10%.
  const esc = input.trainingEscalation ?? [];
  const tail = esc.slice(-3);
  const h1 = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null;
  results.push({
    id: 'H1',
    statement: 'Escalation share decreases during training and settles below 10%',
    target: `mean of last 3 iterations < ${pct(TARGETS.h1MaxEscalation)}`,
    measured: h1 === null ? 'no training log' : `${pct(esc[0])} → ${pct(h1)}`,
    confirmed: h1 !== null && h1 < TARGETS.h1MaxEscalation && h1 <= esc[0],
    details: { first: esc[0] ?? null, lastThreeMean: h1 },
  });

  // H2: some threshold reaches >= 90% of System Two's score at >= 10x lower cost per move.
  // H2 considers every hybrid variant, with and without guard.
  const candidates = s2
    ? allHybrids.map((h) => {
        const scoreRatio = s2.score.mean > 0 ? h.score.mean / s2.score.mean : 0;
        const costRatio = h.costPerMove > 0 ? s2.costPerMove / h.costPerMove : Infinity;
        const ok = scoreRatio >= TARGETS.h2MinScoreRatio && costRatio >= TARGETS.h2MinCostRatio;
        return { name: h.name, scoreRatio, costRatio, ok };
      })
    : [];
  const confirmed2 = candidates.some((c) => c.ok);
  // Best = the passing variant with the highest score or, if none passes, the one
  // closest to passing on both axes (max of the smaller normalized ratio).
  const closeness = (c: (typeof candidates)[number]) =>
    Math.min(c.scoreRatio / TARGETS.h2MinScoreRatio, c.costRatio / TARGETS.h2MinCostRatio);
  const pool = confirmed2 ? candidates.filter((c) => c.ok) : candidates;
  const key = confirmed2 ? (c: (typeof candidates)[number]) => c.scoreRatio : closeness;
  const best = pool.reduce<(typeof candidates)[number] | null>((b, c) => (!b || key(c) > key(b) ? c : b), null);
  results.push({
    id: 'H2',
    statement: 'The hybrid reaches at least 90% of System Two score with at least 10x lower mean cost per move',
    target: `score ≥ ${pct(TARGETS.h2MinScoreRatio)} of System Two and cost ratio ≥ ${TARGETS.h2MinCostRatio}x`,
    measured: best ? `${best.name}: score ${pct(best.scoreRatio)} of System Two, System Two/hybrid cost per move ${best.costRatio.toFixed(1)}x` : 'missing conditions',
    confirmed: confirmed2,
    details: { best: best?.name ?? null, scoreRatio: best?.scoreRatio ?? null, costRatio: best?.costRatio ?? null },
  });

  // H3: System One alone reaches a measurable share of the teacher's score.
  const r3 = s1 && s2 && s2.score.mean > 0 ? s1.score.mean / s2.score.mean : null;
  results.push({
    id: 'H3',
    statement: 'System One alone reaches a measurable share of the teacher score',
    target: `≥ ${pct(TARGETS.h3MinScoreRatio)} of System Two`,
    measured: r3 === null ? 'missing conditions' : pct(r3),
    confirmed: r3 !== null && r3 >= TARGETS.h3MinScoreRatio,
    details: { scoreRatio: r3 },
  });

  // H4: above the confidence threshold the student agrees with the teacher.
  const ref = hybrids.find((h) => h.params.threshold === refThreshold);
  const a4 = ref?.agreementAboveThreshold ?? null;
  results.push({
    id: 'H4',
    statement: 'Above the confidence threshold System One agrees with the teacher',
    target: `≥ ${pct(TARGETS.h4MinAgreement)} at threshold ${refThreshold}`,
    measured:
      a4 !== null
        ? `${pct(a4)} (ECE ${ref?.calibration?.ece.toFixed(3) ?? '-'})`
        : ref
          ? `System One never acted at threshold ${refThreshold}: its confidence never reached it`
          : 'missing conditions',
    confirmed: a4 !== null && a4 >= TARGETS.h4MinAgreement,
    details: { agreement: a4, ece: ref?.calibration?.ece ?? null },
  });

  return results;
}
