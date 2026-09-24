/**
 * Claim: the guard is what makes the Snake hybrid work. Same model, same dev seeds,
 * hybrid with and without the guard at several thresholds, plus guard only.
 */
import { seedsFor, runCondition } from '../src/eval';
import { SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';
import { HybridPlayer, NetStudent, TeacherPlayer } from '../src/hybrid';
import type { ExperimentResult } from './common';
import { referenceModel } from './common';

export function run(): ExperimentResult {
  const { net: maybeNet, calibrationT } = referenceModel('snake');
  const net = maybeNet!;
  const seeds = seedsFor('dev', 50);
  const results: Record<string, unknown> = {};
  const planner = runCondition(
    { name: 'planner', kind: 'system2', params: {}, makePlayer: () => new TeacherPlayer(new SnakeTeacher({ depth: 1 })) },
    { makeEnv: () => new SnakeEnv(), seeds },
  );
  results.planner = { score: planner.score.mean, costPerMove: planner.costPerMove };
  for (const guarded of [false, true]) {
    for (const threshold of guarded ? [0, 0.7, 0.9] : [0.7, 0.9, 0.95]) {
      const r = runCondition(
        {
          name: `${guarded ? 'guard' : 'no-guard'}@${threshold}`,
          kind: 'hybrid',
          params: { threshold },
          makePlayer: () => new HybridPlayer(new NetStudent(net, calibrationT), new SnakeTeacher({ depth: 1 }), { threshold }, guarded ? new SnakeGuard() : undefined),
        },
        { makeEnv: () => new SnakeEnv(), seeds },
      );
      results[r.name] = { score: r.score.mean, ci95: r.score.ci95, costPerMove: r.costPerMove, escalationRate: r.escalationRate, guardEscalation: r.escalationByReason?.guard ?? null };
    }
  }
  return {
    claim: 'With the same model, adding the guard turns a failing hybrid into one that plays near the planner at a fraction of its cost.',
    split: 'dev',
    seeds,
    config: { teacherDepth: 1, model: 'experiments/models/snake (pipeline seed 1)' },
    results,
  };
}
