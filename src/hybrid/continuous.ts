import { Rng } from '../core/rng';
import type { ContinuousGuard, ContinuousTeacher, Env, MoveRecord, Player } from '../core/types';
import type { Ensemble } from '../nn/ensemble';

/** Continuous agreement rule of a game (student action vs planner action). */
export type AgreementRule = (student: ArrayLike<number>, planner: ArrayLike<number>) => boolean;

/** Discrete index of the planner's best action, from its scores. */
function argmaxScores(scores: Float64Array): number {
  let best = 0;
  for (let a = 1; a < scores.length; a++) if (scores[a] > scores[best]) best = a;
  return best;
}

/** Continuous System One alone: the ensemble's mean action (cost = ensemble size). */
export class ContinuousStudentPlayer implements Player {
  readonly name = 'system1:ensemble';
  constructor(readonly ensemble: Ensemble) {}

  act(env: Env): MoveRecord {
    const state = env.encode();
    const d = this.ensemble.decide(state);
    return { action: -1, continuous: d.action, decider: 'system1', cost: d.cost, confidence: d.confidence, state };
  }
}

export interface ContinuousHybridConfig {
  threshold: number;
  auditRate: number;
  seed: number;
}

/**
 * Continuous hybrid: the ensemble proposes; if confident, an optional guard checks
 * the continuous action; the planner acts on low confidence or a guard rejection.
 */
export class ContinuousHybridPlayer implements Player {
  readonly name: string;
  readonly config: ContinuousHybridConfig;
  private rng: Rng;

  constructor(
    readonly ensemble: Ensemble,
    readonly teacher: ContinuousTeacher,
    readonly agrees: AgreementRule,
    config: Partial<ContinuousHybridConfig> = {},
    readonly guard?: ContinuousGuard,
  ) {
    this.config = { threshold: 0.9, auditRate: 0, seed: 0, ...config };
    this.rng = Rng.stream(this.config.seed, 'continuous-hybrid-audit');
    this.name = `hybrid${guard ? '+guard' : ''}@${this.config.threshold}:ensemble`;
  }

  act(env: Env): MoveRecord {
    const state = env.encode();
    const d = this.ensemble.decide(state);
    const base = { confidence: d.confidence, state };
    if (d.confidence < this.config.threshold) return this.escalate(env, d.action, d.cost, 0, 'confidence', base);
    let guardCost = 0;
    if (this.guard) {
      const g = this.guard.checkContinuous(env, d.action);
      guardCost = g.cost;
      if (!g.ok) return this.escalate(env, d.action, d.cost, guardCost, 'guard', { ...base, guardCost });
    }
    const guarded = this.guard ? { guardCost } : {};
    const audit = this.config.auditRate > 0 && this.rng.next() < this.config.auditRate;
    if (!audit) return { ...base, ...guarded, action: -1, continuous: d.action, decider: 'system1', cost: d.cost + guardCost };
    const t = this.teacher.targetAction(env);
    return {
      ...base,
      ...guarded,
      action: -1,
      continuous: d.action,
      decider: 'system1',
      cost: d.cost + guardCost + t.cost,
      teacherScores: t.scores,
      teacherAction: t.action,
      agreed: this.agrees(d.action, t.action),
      audited: true,
    };
  }

  private escalate(env: Env, studentAction: Float64Array, ensembleCost: number, guardCost: number, reason: 'confidence' | 'guard', base: Partial<MoveRecord>): MoveRecord {
    const t = this.teacher.targetAction(env);
    return {
      ...base,
      action: argmaxScores(t.scores),
      continuous: t.action,
      decider: 'system2',
      escalationReason: reason,
      cost: ensembleCost + guardCost + t.cost,
      teacherScores: t.scores,
      teacherAction: t.action,
      agreed: this.agrees(studentAction, t.action),
    };
  }
}
