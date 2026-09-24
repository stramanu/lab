/**
 * Claim: without the guard, the hybrid's deaths are caused by confident System One moves.
 * For each death of the unguarded hybrid (threshold 0.9), find (a) the last move System One played
 * against the planner's choice and (b) the last point from which the planner, taking over, survives
 * 300 more moves. If they coincide, the confident mistake is what sealed the game.
 */
import { seedsFor } from '../src/eval';
import { argmax } from '../src/core/types';
import { SnakeEnv, SnakeTeacher } from '../src/games/snake';
import { HybridPlayer, NetStudent } from '../src/hybrid';
import type { ExperimentResult } from './common';
import { referenceModel } from './common';

const SURVIVE = 300;
const LOOKBACK = 100;

export function run(): ExperimentResult {
  const { net: maybeNet, calibrationT } = referenceModel('snake');
  const net = maybeNet!;
  const teacher = new SnakeTeacher({ depth: 1 });
  const hybrid = new HybridPlayer(new NetStudent(net, calibrationT), teacher, { threshold: 0.9 });
  const seeds = seedsFor('dev', 30);

  const survives = (from: SnakeEnv) => {
    const e = from.clone();
    for (let i = 0; i < SURVIVE && !e.isDone(); i++) e.step(argmax(teacher.score(e).scores));
    return !e.isDone() || e.endReason === 'win';
  };

  const deaths: Array<{ seed: number; score: number; lastMismatch: number | null; lastSavable: number | null }> = [];
  for (const seed of seeds) {
    const env = new SnakeEnv();
    env.reset(seed);
    const history: Array<{ snap: SnakeEnv; mismatch: boolean }> = [];
    while (!env.isDone()) {
      const snap = env.clone();
      const m = hybrid.act(env);
      const mismatch = m.decider === 'system1' && argmax(teacher.score(env).scores) !== m.action;
      history.push({ snap, mismatch });
      env.step(m.action);
    }
    if (env.endReason === 'win' || env.endReason === 'starvation') continue;
    const tail = history.slice(-LOOKBACK);
    const mismatchBack = tail.map((h, i) => (h.mismatch ? tail.length - i : -1)).filter((x) => x > 0);
    let lastSavable: number | null = null;
    for (let back = 1; back <= Math.min(LOOKBACK, history.length); back++) {
      if (survives(history[history.length - back].snap)) {
        lastSavable = back;
        break;
      }
    }
    deaths.push({ seed, score: env.score(), lastMismatch: mismatchBack.length ? Math.min(...mismatchBack) : null, lastSavable });
  }
  const coincide = deaths.filter((d) => d.lastMismatch !== null && d.lastMismatch === d.lastSavable).length;
  return {
    claim: 'Without the guard, most hybrid deaths are sealed by a confident System One move that disagrees with the planner.',
    split: 'dev',
    seeds,
    config: { threshold: 0.9, teacherDepth: 1, surviveMoves: SURVIVE, lookback: LOOKBACK, model: 'experiments/models/snake (pipeline seed 1)' },
    results: { deaths: deaths.length, sealedByConfidentMismatch: coincide, perDeath: deaths },
  };
}
