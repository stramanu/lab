import { describe, expect, it } from 'vitest';
import type { Decision, Env, Student, Teacher, TeacherResult } from '../src/core/types';
import { SnakeEnv, SnakeTeacher } from '../src/games/snake';
import { HybridPlayer, NetStudent, StudentPlayer, TeacherPlayer, confidence } from '../src/hybrid';
import { Mlp } from '../src/nn';

class FixedStudent implements Student {
  readonly name = 'fixed';
  calls = 0;
  constructor(private probs: number[]) {}
  decide(): Decision {
    this.calls++;
    const probs = Float32Array.from(this.probs);
    let choice = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[choice]) choice = i;
    return { choice, probs, confidence: confidence(probs, 'maxProb'), cost: 1 };
  }
}

class FixedTeacher implements Teacher {
  readonly name = 'fixed-teacher';
  calls = 0;
  constructor(private scores: number[], private cost = 50) {}
  score(_env: Env): TeacherResult {
    this.calls++;
    return { scores: Float64Array.from(this.scores), cost: this.cost };
  }
}

function freshEnv(): SnakeEnv {
  const env = new SnakeEnv();
  env.reset(1);
  return env;
}

describe('confidence measures', () => {
  it('max probability and margin', () => {
    expect(confidence([0.6, 0.3, 0.1], 'maxProb')).toBeCloseTo(0.6, 10);
    expect(confidence([0.6, 0.3, 0.1], 'margin')).toBeCloseTo(0.3, 10);
    expect(confidence([0.1, 0.3, 0.6], 'margin')).toBeCloseTo(0.3, 10);
  });
});

describe('NetStudent', () => {
  it('decides with a single forward pass and well-formed probabilities', () => {
    const net = new Mlp({ inputSize: 201, hidden: [16, 16], outputSize: 3, seed: 1 });
    const student = new NetStudent(net);
    const env = freshEnv();
    const d = student.decide(env.encode(), [true, false, true]);
    expect(d.cost).toBe(1);
    expect(d.probs[1]).toBe(0);
    expect(d.probs[0] + d.probs[2]).toBeCloseTo(1, 6);
    expect(d.choice === 0 || d.choice === 2).toBe(true);
    expect(d.confidence).toBeGreaterThanOrEqual(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
  });
});

describe('HybridPlayer', () => {
  it('plays the student move without querying the teacher when confident', () => {
    const teacher = new FixedTeacher([0, 0, 10]);
    const h = new HybridPlayer(new FixedStudent([0.95, 0.03, 0.02]), teacher, { threshold: 0.9 });
    const m = h.act(freshEnv());
    expect(m.action).toBe(0);
    expect(m.decider).toBe('system1');
    expect(m.cost).toBe(1);
    expect(teacher.calls).toBe(0);
    expect(m.agreed).toBeUndefined();
  });

  it('escalates below threshold and plays the teacher best action', () => {
    const teacher = new FixedTeacher([0, 0, 10], 50);
    const h = new HybridPlayer(new FixedStudent([0.5, 0.3, 0.2]), teacher, { threshold: 0.9 });
    const m = h.act(freshEnv());
    expect(m.decider).toBe('system2');
    expect(m.action).toBe(2);
    expect(m.agreed).toBe(false);
    expect(m.cost).toBe(1 + 50);
    expect(m.teacherScores).toBeDefined();
  });

  it('never escalates with threshold 0', () => {
    const teacher = new FixedTeacher([0, 0, 10]);
    const h = new HybridPlayer(new FixedStudent([0.34, 0.33, 0.33]), teacher, { threshold: 0 });
    for (let i = 0; i < 20; i++) expect(h.act(freshEnv()).decider).toBe('system1');
    expect(teacher.calls).toBe(0);
  });

  it('behaves as the teacher alone with threshold > 1', () => {
    const teacher = new SnakeTeacher({ depth: 0 });
    const hybrid = new HybridPlayer(new FixedStudent([1, 0, 0]), teacher, { threshold: 1.01 });
    const alone = new TeacherPlayer(teacher);
    const a = freshEnv();
    const b = freshEnv();
    for (let t = 0; t < 200 && !a.isDone(); t++) {
      const ma = hybrid.act(a);
      const mb = alone.act(b);
      expect(ma.decider).toBe('system2');
      expect(ma.action).toBe(mb.action);
      a.step(ma.action);
      b.step(mb.action);
    }
    expect(a.render()).toBe(b.render());
  });

  it('audits a fraction of confident decisions and records agreement', () => {
    const teacher = new FixedTeacher([10, 0, 0], 50);
    const h = new HybridPlayer(new FixedStudent([0.95, 0.03, 0.02]), teacher, { threshold: 0.9, auditRate: 0.5, seed: 3 });
    const moves = Array.from({ length: 200 }, () => h.act(freshEnv()));
    const audited = moves.filter((m) => m.audited);
    expect(audited.length).toBeGreaterThan(50);
    expect(audited.length).toBeLessThan(150);
    expect(audited.every((m) => m.agreed === true && m.decider === 'system1' && m.cost === 51)).toBe(true);
  });
});

describe('single-system players', () => {
  it('student player reports cost 1 and system1', () => {
    const m = new StudentPlayer(new FixedStudent([0.2, 0.7, 0.1])).act(freshEnv());
    expect(m).toMatchObject({ action: 1, decider: 'system1', cost: 1 });
  });
});

class FixedGuard {
  readonly name = 'fixed-guard';
  calls = 0;
  constructor(private ok: boolean, private cost = 7) {}
  check() {
    this.calls++;
    return { ok: this.ok, cost: this.cost };
  }
}

describe('HybridPlayer with guard', () => {
  it('escalates when the guard rejects a confident action', () => {
    const teacher = new FixedTeacher([0, 0, 10], 50);
    const h = new HybridPlayer(new FixedStudent([0.95, 0.03, 0.02]), teacher, { threshold: 0.9 }, new FixedGuard(false, 7));
    const m = h.act(freshEnv());
    expect(m).toMatchObject({ action: 2, decider: 'system2', escalationReason: 'guard', guardCost: 7, cost: 1 + 7 + 50 });
  });

  it('plays the student action when the guard accepts it', () => {
    const teacher = new FixedTeacher([0, 0, 10], 50);
    const h = new HybridPlayer(new FixedStudent([0.95, 0.03, 0.02]), teacher, { threshold: 0.9 }, new FixedGuard(true, 7));
    const m = h.act(freshEnv());
    expect(m).toMatchObject({ action: 0, decider: 'system1', guardCost: 7, cost: 8 });
    expect(m.escalationReason).toBeUndefined();
    expect(teacher.calls).toBe(0);
  });

  it('does not run the guard on low-confidence moves', () => {
    const guard = new FixedGuard(true);
    const h = new HybridPlayer(new FixedStudent([0.5, 0.3, 0.2]), new FixedTeacher([0, 0, 10], 50), { threshold: 0.9 }, guard);
    const m = h.act(freshEnv());
    expect(m).toMatchObject({ decider: 'system2', escalationReason: 'confidence', cost: 51 });
    expect(guard.calls).toBe(0);
  });

  it('with threshold 0 escalates only on guard rejections', () => {
    const h = new HybridPlayer(new FixedStudent([0.34, 0.33, 0.33]), new FixedTeacher([0, 0, 10]), { threshold: 0 }, new FixedGuard(false));
    for (let i = 0; i < 10; i++) expect(h.act(freshEnv()).escalationReason).toBe('guard');
  });

  it('records confidence as the reason for plain escalations', () => {
    const h = new HybridPlayer(new FixedStudent([0.5, 0.3, 0.2]), new FixedTeacher([0, 0, 10]), { threshold: 0.9 });
    expect(h.act(freshEnv()).escalationReason).toBe('confidence');
  });
});
