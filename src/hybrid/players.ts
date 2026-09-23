import { Rng } from '../core/rng';
import { argmax, type Decision, type Env, type Guard, type MoveRecord, type Player, type Student, type Teacher } from '../core/types';
import type { Mlp } from '../nn/mlp';
import { confidence, type ConfidenceMeasure } from './confidence';

/** System One: the micro-network, one forward pass per decision (cost 1). */
export class NetStudent implements Student {
  readonly name: string;

  constructor(
    readonly net: Mlp,
    public temperature = 1,
    readonly measure: ConfidenceMeasure = 'maxProb',
  ) {
    this.name = `mlp-${measure}`;
  }

  decide(state: Float32Array, legal: readonly boolean[]): Decision {
    const probs = this.net.probs(state, legal, this.temperature);
    const choice = argmax(probs, legal);
    return { choice, probs, confidence: confidence(probs, this.measure), cost: 1 };
  }
}

/** System Two alone. */
export class TeacherPlayer implements Player {
  readonly name: string;

  constructor(readonly teacher: Teacher) {
    this.name = `system2:${teacher.name}`;
  }

  act(env: Env): MoveRecord {
    const { scores, cost } = this.teacher.score(env);
    return { action: argmax(scores, env.legalActions()), decider: 'system2', cost, teacherScores: scores };
  }
}

/** System One alone: pure intuition, no escalation. */
export class StudentPlayer implements Player {
  readonly name: string;

  constructor(readonly student: Student) {
    this.name = `system1:${student.name}`;
  }

  act(env: Env): MoveRecord {
    const state = env.encode();
    const d = this.student.decide(state, env.legalActions());
    return { action: d.choice, decider: 'system1', cost: d.cost, confidence: d.confidence, probs: d.probs, state };
  }
}

export interface HybridConfig {
  /** Escalate when student confidence is below this value. */
  threshold: number;
  /** Fraction of confident decisions that are still checked by the teacher (training only). */
  auditRate: number;
  seed: number;
}

/**
 * Three tiers: System One proposes; if it is confident, an optional guard
 * cheaply verifies the proposal; System Two runs only on low confidence or a
 * guard rejection. Every move records who decided, why it escalated, the
 * confidence, probabilities, cost (guard included) and, when known, agreement.
 */
export class HybridPlayer implements Player {
  readonly name: string;
  readonly config: HybridConfig;
  private rng: Rng;

  constructor(
    readonly student: Student,
    readonly teacher: Teacher,
    config: Partial<HybridConfig> = {},
    readonly guard?: Guard,
  ) {
    this.config = { threshold: 0.9, auditRate: 0, seed: 0, ...config };
    this.rng = Rng.stream(this.config.seed, 'hybrid-audit');
    this.name = `hybrid${guard ? '+guard' : ''}@${this.config.threshold}:${student.name}`;
  }

  act(env: Env): MoveRecord {
    const legal = env.legalActions();
    const state = env.encode();
    const d = this.student.decide(state, legal);
    const base = { confidence: d.confidence, probs: d.probs, state };

    if (d.confidence < this.config.threshold) return this.escalate(env, legal, d, base, 'confidence', 0);

    // The guard only runs on confident proposals: low-confidence moves escalate anyway.
    let guardCost = 0;
    if (this.guard) {
      const g = this.guard.check(env, d.choice);
      guardCost = g.cost;
      if (!g.ok) return this.escalate(env, legal, d, { ...base, guardCost }, 'guard', guardCost);
    }
    const guarded = this.guard ? { guardCost } : {};

    // Draw only when auditing is enabled, so audit-free runs keep the same stream.
    const audit = this.config.auditRate > 0 && this.rng.next() < this.config.auditRate;
    if (!audit) return { ...base, ...guarded, action: d.choice, decider: 'system1', cost: d.cost + guardCost };
    const t = this.teacher.score(env);
    return {
      ...base,
      ...guarded,
      action: d.choice,
      decider: 'system1',
      cost: d.cost + guardCost + t.cost,
      teacherScores: t.scores,
      agreed: argmax(t.scores, legal) === d.choice,
      audited: true,
    };
  }

  private escalate(
    env: Env,
    legal: boolean[],
    d: Decision,
    base: Partial<MoveRecord>,
    reason: 'confidence' | 'guard',
    guardCost: number,
  ): MoveRecord {
    const t = this.teacher.score(env);
    const action = argmax(t.scores, legal);
    return {
      ...base,
      action,
      decider: 'system2',
      escalationReason: reason,
      cost: d.cost + guardCost + t.cost,
      teacherScores: t.scores,
      agreed: action === d.choice,
    };
  }
}
