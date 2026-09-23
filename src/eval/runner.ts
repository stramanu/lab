import { ci95, mean, median } from '../core/stats';
import { argmax, type Env, type Player, type Teacher } from '../core/types';
import { reliability, type Reliability } from '../nn/calibration';

export type ConditionKind = 'random' | 'system2' | 'system1' | 'hybrid';

export interface Condition {
  name: string;
  kind: ConditionKind;
  params: Record<string, number | string>;
  makePlayer(): Player;
}

export interface ConditionResult {
  name: string;
  kind: ConditionKind;
  params: Record<string, number | string>;
  episodes: number;
  score: { mean: number; ci95: number; median: number; min: number; max: number };
  endReasons: Record<string, number>;
  /** Mean of each game-specific summary metric. */
  gameMetrics: Record<string, number>;
  moves: number;
  /** Mean cost per move in compute units. */
  costPerMove: number;
  /** Mean wall-clock time per decision in microseconds. */
  usPerMove: number;
  system2Calls: number;
  /** Fraction of moves decided by System Two (hybrid only). */
  escalationRate: number | null;
  /** Escalation rate split by reason (hybrid only); the parts sum to escalationRate. */
  escalationByReason: { confidence: number; guard: number } | null;
  /** Fraction of the total cost spent in guard checks (guarded conditions only). */
  guardCostShare: number | null;
  /** Student/teacher agreement over moves decided by System One (hybrid: above threshold). */
  agreementAboveThreshold: number | null;
  /** Calibration of the student's confidence against the reference teacher. */
  calibration: Reliability | null;
}

export interface RunOptions {
  makeEnv(): Env;
  seeds: number[];
  /**
   * Reference teacher used, outside the timed section, to label moves decided
   * by System One (agreement and calibration). Not counted in cost or time.
   */
  oracle?: Teacher;
  onEpisode?(condition: string, index: number, score: number): void;
}

export function runCondition(condition: Condition, options: RunOptions): ConditionResult {
  const player = condition.makePlayer();
  const scores: number[] = [];
  const endReasons: Record<string, number> = {};
  const metricSums: Record<string, number> = {};
  let moves = 0;
  let cost = 0;
  let timeMs = 0;
  let system2Calls = 0;
  let escalated = 0;
  const byReason = { confidence: 0, guard: 0 };
  let guardCost = 0;
  let guardRuns = 0;
  let s1Moves = 0;
  let s1Agreed = 0;
  const confidences: number[] = [];
  const correct: boolean[] = [];

  options.seeds.forEach((seed, idx) => {
    const env = options.makeEnv();
    env.reset(seed);
    while (!env.isDone()) {
      const t0 = performance.now();
      const move = player.act(env);
      timeMs += performance.now() - t0;
      moves++;
      cost += move.cost;
      if (move.teacherScores) system2Calls++;
      if (move.decider === 'system2') escalated++;
      if (move.escalationReason) byReason[move.escalationReason]++;
      if (move.guardCost !== undefined) {
        guardCost += move.guardCost;
        guardRuns++;
      }

      if (move.confidence !== undefined && move.probs) {
        const legal = env.legalActions();
        const studentChoice = argmax(move.probs, legal);
        let teacherChoice: number | null = null;
        if (move.teacherScores) teacherChoice = argmax(move.teacherScores, legal);
        else if (options.oracle) teacherChoice = argmax(options.oracle.score(env).scores, legal);
        if (teacherChoice !== null) {
          confidences.push(move.confidence);
          correct.push(studentChoice === teacherChoice);
          if (move.decider === 'system1') {
            s1Moves++;
            if (studentChoice === teacherChoice) s1Agreed++;
          }
        }
      }
      env.step(move.action);
    }
    const summary = env.summary();
    scores.push(summary.score);
    endReasons[summary.endReason] = (endReasons[summary.endReason] ?? 0) + 1;
    for (const [k, v] of Object.entries(summary.metrics)) metricSums[k] = (metricSums[k] ?? 0) + v;
    options.onEpisode?.(condition.name, idx, summary.score);
  });

  const n = options.seeds.length;
  const hasStudent = condition.kind === 'system1' || condition.kind === 'hybrid';
  return {
    name: condition.name,
    kind: condition.kind,
    params: condition.params,
    episodes: n,
    score: { mean: mean(scores), ci95: ci95(scores), median: median(scores), min: Math.min(...scores), max: Math.max(...scores) },
    endReasons,
    gameMetrics: Object.fromEntries(Object.entries(metricSums).map(([k, v]) => [k, v / n])),
    moves,
    costPerMove: moves ? cost / moves : 0,
    usPerMove: moves ? (timeMs * 1000) / moves : 0,
    system2Calls,
    escalationRate: condition.kind === 'hybrid' ? escalated / Math.max(moves, 1) : null,
    escalationByReason:
      condition.kind === 'hybrid'
        ? { confidence: byReason.confidence / Math.max(moves, 1), guard: byReason.guard / Math.max(moves, 1) }
        : null,
    guardCostShare: guardRuns > 0 && cost > 0 ? guardCost / cost : null,
    agreementAboveThreshold: hasStudent && s1Moves ? s1Agreed / s1Moves : null,
    calibration: hasStudent && confidences.length ? reliability(confidences, correct) : null,
  };
}
