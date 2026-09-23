import type { HypothesisResult } from './hypotheses';
import type { ConditionResult } from './runner';

export interface EvalReport {
  game: string;
  createdAt: string;
  seeds: { count: number; first: number; last: number };
  model: { params: number; weightsKB: number; calibrationT: number; trainingSeconds: number | null };
  hardware: Record<string, string | number>;
  conditions: ConditionResult[];
  hypotheses: HypothesisResult[];
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

/** Human-readable summary table, one row per condition, followed by the hypotheses. */
export function formatReport(r: EvalReport): string {
  const lines: string[] = [];
  lines.push(`${r.game} — ${r.seeds.count} eval seeds (${r.seeds.first}..${r.seeds.last})`);
  lines.push(
    `model: ${r.model.params} params, ${r.model.weightsKB.toFixed(1)} KB, T=${r.model.calibrationT.toFixed(2)}` +
      (r.model.trainingSeconds !== null ? `, trained in ${r.model.trainingSeconds}s` : ''),
  );
  lines.push(`hardware: ${Object.entries(r.hardware).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  lines.push('');
  const header = [
    pad('condition', 28),
    lpad('score', 8),
    lpad('±95%', 7),
    lpad('median', 7),
    lpad('cost/move', 10),
    lpad('µs/move', 8),
    lpad('S2 calls', 9),
    lpad('escal.', 7),
    lpad('guard', 6),
    lpad('g.cost', 7),
    lpad('agree', 7),
    lpad('ECE', 6),
    '  end reasons',
  ].join(' ');
  lines.push(header);
  lines.push('-'.repeat(header.length));
  for (const c of r.conditions) {
    const opt = (v: number | null, f: (x: number) => string) => (v === null ? '-' : f(v));
    lines.push(
      [
        pad(c.name, 28),
        lpad(c.score.mean.toFixed(1), 8),
        lpad(c.score.ci95.toFixed(1), 7),
        lpad(c.score.median.toFixed(1), 7),
        lpad(c.costPerMove.toFixed(1), 10),
        lpad(c.usPerMove.toFixed(1), 8),
        lpad(String(c.system2Calls), 9),
        lpad(opt(c.escalationRate, (v) => `${(v * 100).toFixed(1)}%`), 7),
        lpad(opt(c.escalationByReason?.guard ?? null, (v) => `${(v * 100).toFixed(1)}%`), 6),
        lpad(opt(c.guardCostShare, (v) => `${(v * 100).toFixed(0)}%`), 7),
        lpad(opt(c.agreementAboveThreshold, (v) => `${(v * 100).toFixed(1)}%`), 7),
        lpad(opt(c.calibration?.ece ?? null, (v) => v.toFixed(3)), 6),
        '  ' + Object.entries(c.endReasons).map(([k, v]) => `${k}:${v}`).join(' '),
      ].join(' '),
    );
  }
  lines.push('');
  for (const h of r.hypotheses) {
    lines.push(`${h.id} ${h.confirmed ? 'CONFIRMED    ' : 'NOT CONFIRMED'}  ${h.measured}  (target: ${h.target})`);
  }
  return lines.join('\n');
}
