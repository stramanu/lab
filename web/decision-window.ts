import type { DecisionState } from './game-view';

const CODE: Record<DecisionState, number> = { system1: 0, guard: 1, system2: 2 };

/** The last `size` moves: who decided each one and what it cost ("Who decided" and the cost readout). */
export class DecisionWindow {
  private readonly states: Uint8Array;
  private readonly costs: Float64Array;
  private ptr = 0;
  count = 0;

  constructor(readonly size = 1000) {
    this.states = new Uint8Array(size);
    this.costs = new Float64Array(size);
  }

  push(state: DecisionState, cost: number): void {
    this.states[this.ptr] = CODE[state];
    this.costs[this.ptr] = cost;
    this.ptr = (this.ptr + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  clear(): void {
    this.ptr = 0;
    this.count = 0;
  }

  /** Share of moves decided by System One, by the planner after the guard, and by the planner on low confidence. */
  shares(): { system1: number; guard: number; system2: number } {
    const c = [0, 0, 0];
    for (let i = 0; i < this.count; i++) c[this.states[i]]++;
    const n = Math.max(1, this.count);
    return { system1: c[0] / n, guard: c[1] / n, system2: c[2] / n };
  }

  meanCost(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.costs[i];
    return this.count ? s / this.count : 0;
  }
}
