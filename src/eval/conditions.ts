import { RandomPlayer } from '../core/players';
import type { ContinuousGuard, ContinuousTeacher, Guard, Teacher } from '../core/types';
import type { ConfidenceMeasure } from '../hybrid/confidence';
import { ContinuousHybridPlayer, ContinuousStudentPlayer, type AgreementRule } from '../hybrid/continuous';
import { HybridPlayer, NetStudent, StudentPlayer, TeacherPlayer } from '../hybrid/players';
import type { Ensemble } from '../nn/ensemble';
import type { Mlp } from '../nn/mlp';
import type { Condition } from './runner';

export const DEFAULT_THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95];

export interface StandardConditionsOptions {
  /** Teacher at a given cost-knob level. */
  makeTeacher(level: number): Teacher;
  /** Cost-knob levels for the System Two conditions (e.g. lookahead depths). */
  levels: number[];
  /** Level used as teacher during training: the hybrid escalates to it. */
  referenceLevel: number;
  net: Mlp;
  temperature: number;
  thresholds?: number[];
  /** Confidence measures to evaluate for the hybrid; the first is the primary one. */
  measures?: ConfidenceMeasure[];
  /** When given, adds guarded hybrids at every threshold and a guard-only condition. */
  guard?: Guard;
  seed?: number;
}

/**
 * Random, System Two at each level, System One alone, Hybrid at each threshold
 * and measure and, with a guard, the same hybrids guarded plus guard only.
 */
export function standardConditions(o: StandardConditionsOptions): Condition[] {
  const thresholds = o.thresholds ?? DEFAULT_THRESHOLDS;
  const measures = o.measures ?? ['maxProb', 'margin'];
  const conditions: Condition[] = [
    { name: 'random', kind: 'random', params: {}, makePlayer: () => new RandomPlayer(o.seed ?? 0) },
  ];
  for (const level of o.levels) {
    conditions.push({
      name: `system2 (level ${level})`,
      kind: 'system2',
      params: { level },
      makePlayer: () => new TeacherPlayer(o.makeTeacher(level)),
    });
  }
  conditions.push({
    name: 'system1',
    kind: 'system1',
    params: { confidence: measures[0] },
    makePlayer: () => new StudentPlayer(new NetStudent(o.net, o.temperature, measures[0])),
  });
  for (const measure of measures) {
    for (const threshold of thresholds) {
      conditions.push({
        name: `hybrid ${measure}@${threshold}`,
        kind: 'hybrid',
        params: { threshold, confidence: measure, level: o.referenceLevel },
        makePlayer: () =>
          new HybridPlayer(new NetStudent(o.net, o.temperature, measure), o.makeTeacher(o.referenceLevel), {
            threshold,
            auditRate: 0,
          }),
      });
    }
  }
  const guard = o.guard;
  if (guard) {
    const hybrid = (measure: ConfidenceMeasure, threshold: number) => () =>
      new HybridPlayer(new NetStudent(o.net, o.temperature, measure), o.makeTeacher(o.referenceLevel), { threshold, auditRate: 0 }, guard);
    for (const measure of measures) {
      for (const threshold of thresholds) {
        conditions.push({
          name: `hybrid+guard ${measure}@${threshold}`,
          kind: 'hybrid',
          params: { threshold, confidence: measure, level: o.referenceLevel, guard: guard.name },
          makePlayer: hybrid(measure, threshold),
        });
      }
    }
    conditions.push({
      name: 'guard only',
      kind: 'hybrid',
      params: { threshold: 0, confidence: measures[0], level: o.referenceLevel, guard: guard.name },
      makePlayer: hybrid(measures[0], 0),
    });
  }
  return conditions;
}

export interface ContinuousConditionsOptions {
  makeTeacher(level: number): ContinuousTeacher;
  levels: number[];
  referenceLevel: number;
  ensemble: Ensemble;
  agrees: AgreementRule;
  thresholds?: number[];
  guard?: ContinuousGuard;
  seed?: number;
}

/**
 * Conditions for continuous games: random, planner at each level, the ensemble
 * alone and the continuous hybrid at each threshold, with and without guard,
 * plus guard only. Hybrid confidence is the ensemble's calibrated confidence.
 */
export function continuousConditions(o: ContinuousConditionsOptions): Condition[] {
  const thresholds = o.thresholds ?? DEFAULT_THRESHOLDS;
  const conditions: Condition[] = [{ name: 'random', kind: 'random', params: {}, makePlayer: () => new RandomPlayer(o.seed ?? 0) }];
  for (const level of o.levels) {
    conditions.push({ name: `system2 (level ${level})`, kind: 'system2', params: { level }, makePlayer: () => new TeacherPlayer(o.makeTeacher(level)) });
  }
  conditions.push({ name: 'system1', kind: 'system1', params: { confidence: 'ensemble' }, makePlayer: () => new ContinuousStudentPlayer(o.ensemble) });
  const hybrid = (threshold: number, guard?: ContinuousGuard) => () =>
    new ContinuousHybridPlayer(o.ensemble, o.makeTeacher(o.referenceLevel), o.agrees, { threshold, auditRate: 0 }, guard);
  for (const threshold of thresholds) {
    conditions.push({ name: `hybrid ensemble@${threshold}`, kind: 'hybrid', params: { threshold, confidence: 'ensemble', level: o.referenceLevel }, makePlayer: hybrid(threshold) });
  }
  const guard = o.guard;
  if (guard) {
    for (const threshold of thresholds) {
      conditions.push({
        name: `hybrid+guard ensemble@${threshold}`,
        kind: 'hybrid',
        params: { threshold, confidence: 'ensemble', level: o.referenceLevel, guard: guard.name },
        makePlayer: hybrid(threshold, guard),
      });
    }
    conditions.push({ name: 'guard only', kind: 'hybrid', params: { threshold: 0, confidence: 'ensemble', level: o.referenceLevel, guard: guard.name }, makePlayer: hybrid(0, guard) });
  }
  return conditions;
}
