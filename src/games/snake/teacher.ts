import type { Teacher, TeacherResult } from '../../core/types';
import type { SnakeEnv } from './env';
import { distanceToFood, reachableArea, tailReachable, type CostCounter } from './search';

export interface SnakeTeacherConfig {
  /** Lookahead depth: 0 = immediate evaluation only. This is the cost knob. */
  depth: number;
  /** Discount applied to the best child score. */
  gamma: number;
  /**
   * Root-only bonus per action (straight, left, right) that breaks ties
   * deterministically. Each gap is below one distance unit, so it never
   * overrides a real difference, but it is large enough to show in soft labels.
   */
  preference: [number, number, number];
}

export const DEFAULT_SNAKE_TEACHER: SnakeTeacherConfig = { depth: 1, gamma: 0.9, preference: [0.6, 0.3, 0] };

export const DEATH_SCORE = -1000;
const WIN_SCORE = 1000;
const SAFE_BONUS = 200;
const EAT_BONUS = 100;
const DIST_BASE = 50;

/**
 * System Two for Snake: simulate each action, then score it by
 * safety (tail still reachable), progress toward the food along a shortest path,
 * and reachable area. With depth > 0 it adds the discounted best child score.
 * Cost = BFS/flood-fill nodes expanded + simulated states.
 */
export class SnakeTeacher implements Teacher {
  readonly name: string;
  readonly config: SnakeTeacherConfig;

  constructor(config: Partial<SnakeTeacherConfig> = {}) {
    this.config = { ...DEFAULT_SNAKE_TEACHER, ...config };
    this.name = `snake-planner-d${this.config.depth}`;
  }

  score(env: SnakeEnv): TeacherResult {
    const counter: CostCounter = { nodes: 0 };
    const scores = new Float64Array(env.numActions);
    for (let a = 0; a < env.numActions; a++) {
      const v = this.evalAction(env, a, this.config.depth, counter);
      scores[a] = v === DEATH_SCORE ? v : v + this.config.preference[a];
    }
    return { scores, cost: Math.max(1, counter.nodes) };
  }

  private evalAction(env: SnakeEnv, action: number, depth: number, counter: CostCounter): number {
    const sim = env.clone();
    counter.nodes++;
    const before = sim.eaten;
    sim.step(action);
    if (sim.endReason === 'win') return WIN_SCORE;
    if (sim.endReason) return DEATH_SCORE;
    const ate = sim.eaten > before;

    const immediate = this.immediate(sim, ate, counter);
    if (depth === 0) return immediate;
    // After eating, the new food position is unknown to the planner: stop the branch here,
    // but value it as if its immediate score held for the remaining levels, so it stays
    // comparable with branches that accumulate discounted child scores.
    if (ate) return immediate * this.remainingWeight(depth);

    let best = -Infinity;
    for (let b = 0; b < sim.numActions; b++) best = Math.max(best, this.evalAction(sim, b, depth - 1, counter));
    return immediate + this.config.gamma * best;
  }

  /** Sum of gamma^i for i = 0..depth. */
  private remainingWeight(depth: number): number {
    let w = 0;
    let g = 1;
    for (let i = 0; i <= depth; i++) {
      w += g;
      g *= this.config.gamma;
    }
    return w;
  }

  private immediate(sim: SnakeEnv, ate: boolean, counter: CostCounter): number {
    const tailOk = tailReachable(sim, counter);
    const d = distanceToFood(sim, counter);
    const free = Math.max(1, sim.cells - sim.length);
    const area = reachableArea(sim, counter) / free;
    const eat = ate ? EAT_BONUS : 0;
    if (tailOk) {
      // Safe move: distance dominates, area is only a tie-breaker (< 1 point).
      return SAFE_BONUS + eat + (d >= 0 ? DIST_BASE - d : 0) + 0.5 * area;
    }
    // Unsafe move: maximize the room left, distance only as a small tie-breaker.
    return eat + 20 * area + (d >= 0 ? 0.1 * (DIST_BASE - d) : 0);
  }
}
