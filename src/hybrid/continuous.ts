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

/** An escalated decision waiting for the planner's answer. */
export interface Escalation {
  reason: 'confidence' | 'guard';
  studentAction: Float64Array;
  ensembleCost: number;
  guardCost: number;
  base: Partial<MoveRecord>;
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
    const p = this.propose(env);
    return 'move' in p ? p.move : this.resolve(p.escalation, this.teacher.targetAction(env));
  }

  /**
   * First half of a decision: System One proposes and the guard checks. Returns the move, or the
   * escalation to complete with the planner's answer (`resolve`). Lets a caller run the planner
   * elsewhere (the browser demo runs it in a worker); `act` does both halves in place.
   */
  propose(env: Env): { move: MoveRecord } | { escalation: Escalation } {
    const state = env.encode();
    const d = this.ensemble.decide(state);
    const base = { confidence: d.confidence, state };
    const escalate = (reason: 'confidence' | 'guard', guardCost: number, extra: Partial<MoveRecord> = {}) => ({
      escalation: { reason, studentAction: d.action, ensembleCost: d.cost, guardCost, base: { ...base, ...extra } },
    });
    if (d.confidence < this.config.threshold) return escalate('confidence', 0);
    let guardCost = 0;
    if (this.guard) {
      const g = this.guard.checkContinuous(env, d.action);
      guardCost = g.cost;
      if (!g.ok) return escalate('guard', guardCost, { guardCost });
    }
    const guarded = this.guard ? { guardCost } : {};
    const audit = this.config.auditRate > 0 && this.rng.next() < this.config.auditRate;
    if (!audit) return { move: { ...base, ...guarded, action: -1, continuous: d.action, decider: 'system1', cost: d.cost + guardCost } };
    const t = this.teacher.targetAction(env);
    return {
      move: {
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
      },
    };
  }

  /** Second half of an escalated decision: the planner's answer becomes the move. */
  resolve(e: Escalation, t: { action: Float64Array; cost: number; scores: Float64Array }): MoveRecord {
    return {
      ...e.base,
      action: argmaxScores(t.scores),
      continuous: t.action,
      decider: 'system2',
      escalationReason: e.reason,
      cost: e.ensembleCost + e.guardCost + t.cost,
      teacherScores: t.scores,
      teacherAction: t.action,
      agreed: this.agrees(e.studentAction, t.action),
    };
  }
}
