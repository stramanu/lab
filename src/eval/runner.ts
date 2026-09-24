import { ci95, mean, median } from '../core/stats';
import { argmax, type ContinuousEnv, type ContinuousTeacher, type Env, type Player, type Teacher } from '../core/types';
import { reliability, type Reliability } from '../nn/calibration';

export type ConditionKind = 'random' | 'system2' | 'system1' | 'hybrid' | 'baseline';

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
  /** Continuous games: agreement rule between the student's and the planner's continuous actions. */
  agrees?: (student: ArrayLike<number>, planner: ArrayLike<number>) => boolean;
  /**
   * Continuous games: agreement and calibration are measured on every `oracleEvery`-th decision of an
   * episode (default 1: every decision). Applied to all moves alike, so the estimate stays unbiased.
   */
  oracleEvery?: number;
  onEpisode?(condition: string, index: number, score: number): void;
}

/** Everything one episode contributes to a condition's result; records are merged in seed order. */
export interface EpisodeRecord {
  seed: number;
  score: number;
  endReason: string;
  metrics: Record<string, number>;
  moves: number;
  cost: number;
  timeMs: number;
  system2Calls: number;
  escalated: number;
  byReason: { confidence: number; guard: number };
  guardCost: number;
  guardRuns: number;
  s1Moves: number;
  s1Agreed: number;
  confidences: number[];
  correct: boolean[];
}

/** Plays one episode with `player` and records it. */
export function runEpisode(player: Player, seed: number, options: RunOptions): EpisodeRecord {
  const r: EpisodeRecord = {
    seed,
    score: 0,
    endReason: '',
    metrics: {},
    moves: 0,
    cost: 0,
    timeMs: 0,
    system2Calls: 0,
    escalated: 0,
    byReason: { confidence: 0, guard: 0 },
    guardCost: 0,
    guardRuns: 0,
    s1Moves: 0,
    s1Agreed: 0,
    confidences: [],
    correct: [],
  };
  const env = options.makeEnv();
  env.reset(seed);
  player.reset?.(seed);
  const every = options.oracleEvery ?? 1;
  for (let step = 0; !env.isDone(); step++) {
    const t0 = performance.now();
    const move = player.act(env);
    r.timeMs += performance.now() - t0;
    r.moves++;
    r.cost += move.cost;
    if (move.teacherScores) r.system2Calls++;
    if (move.decider === 'system2') r.escalated++;
    if (move.escalationReason) r.byReason[move.escalationReason]++;
    if (move.guardCost !== undefined) {
      r.guardCost += move.guardCost;
      r.guardRuns++;
    }

    if (move.continuous && move.confidence !== undefined && options.agrees && step % every === 0) {
      // Continuous student: agreement comes from the hybrid when the planner ran, otherwise from the oracle.
      let agreed = move.agreed;
      if (agreed === undefined && options.oracle && move.decider === 'system1') {
        agreed = options.agrees(move.continuous, (options.oracle as ContinuousTeacher).targetAction(env).action);
      }
      if (agreed !== undefined) {
        r.confidences.push(move.confidence);
        r.correct.push(agreed);
        if (move.decider === 'system1') {
          r.s1Moves++;
          if (agreed) r.s1Agreed++;
        }
      }
    } else if (!move.continuous && move.confidence !== undefined && move.probs) {
      const legal = env.legalActions();
      const studentChoice = argmax(move.probs, legal);
      let teacherChoice: number | null = null;
      if (move.teacherScores) teacherChoice = argmax(move.teacherScores, legal);
      else if (options.oracle) teacherChoice = argmax(options.oracle.score(env).scores, legal);
      if (teacherChoice !== null) {
        r.confidences.push(move.confidence);
        r.correct.push(studentChoice === teacherChoice);
        if (move.decider === 'system1') {
          r.s1Moves++;
          if (studentChoice === teacherChoice) r.s1Agreed++;
        }
      }
    }
    if (move.continuous) (env as ContinuousEnv).stepContinuous(move.continuous);
    else env.step(move.action);
  }
  const summary = env.summary();
  r.score = summary.score;
  r.endReason = summary.endReason;
  r.metrics = summary.metrics;
  (env as { dispose?: () => void }).dispose?.();
  return r;
}

/** Aggregates episode records (in seed order) into a condition result. */
export function summarise(condition: Pick<Condition, 'name' | 'kind' | 'params'>, records: EpisodeRecord[]): ConditionResult {
  const scores = records.map((r) => r.score);
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
  for (const r of records) {
    endReasons[r.endReason] = (endReasons[r.endReason] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.metrics)) metricSums[k] = (metricSums[k] ?? 0) + v;
    moves += r.moves;
    cost += r.cost;
    timeMs += r.timeMs;
    system2Calls += r.system2Calls;
    escalated += r.escalated;
    byReason.confidence += r.byReason.confidence;
    byReason.guard += r.byReason.guard;
    guardCost += r.guardCost;
    guardRuns += r.guardRuns;
    s1Moves += r.s1Moves;
    s1Agreed += r.s1Agreed;
    confidences.push(...r.confidences);
    correct.push(...r.correct);
  }

  const n = records.length;
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

export function runCondition(condition: Condition, options: RunOptions): ConditionResult {
  const player = condition.makePlayer();
  const records = options.seeds.map((seed, idx) => {
    const r = runEpisode(player, seed, options);
    options.onEpisode?.(condition.name, idx, r.score);
    return r;
  });
  return summarise(condition, records);
}
