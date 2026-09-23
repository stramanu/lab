import { DX, DY } from '../src/games/snake/config';
import type { SnakeEnv } from '../src/games/snake/env';
import { cssVar, fitCanvas } from './charts';

export type DecisionState = 'system1' | 'guard' | 'system2';

export function decisionState(decider: string, reason?: string): DecisionState {
  if (decider !== 'system2') return 'system1';
  return reason === 'guard' ? 'guard' : 'system2';
}

const STATE_VAR: Record<DecisionState, string> = { system1: '--s1', guard: '--guard', system2: '--s2' };

/**
 * Renders the board: a fading trail of recent decisions under the body, the
 * snake with its head colored by who decided the last move, and the food.
 */
export class GameView {
  /** Decision state of the move that brought the head onto each cell, for the trail. */
  private trail = new Map<number, { state: DecisionState; age: number }>();

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(): void {
    this.trail.clear();
  }

  record(env: SnakeEnv, state: DecisionState): void {
    for (const [cell, t] of this.trail) {
      t.age++;
      if (t.age > 60) this.trail.delete(cell);
    }
    this.trail.set(env.head(), { state, age: 0 });
  }

  draw(env: SnakeEnv, last: DecisionState): void {
    const { ctx, w, h } = fitCanvas(this.canvas);
    const size = Math.min(w, h);
    const cell = size / env.width;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;
    const c = this.canvas;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssVar(c, '--board');
    ctx.fillRect(ox, oy, size, size);

    // Millimetre-paper grid.
    ctx.strokeStyle = cssVar(c, '--board-grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < env.width; i++) {
      const p = Math.round(ox + i * cell) + 0.5;
      ctx.moveTo(p, oy);
      ctx.lineTo(p, oy + size);
      const q = Math.round(oy + i * cell) + 0.5;
      ctx.moveTo(ox, q);
      ctx.lineTo(ox + size, q);
    }
    ctx.stroke();

    const xy = (i: number) => [ox + env.x(i) * cell, oy + env.y(i) * cell] as const;

    // Decision trail: who steered the snake through each recent cell.
    for (const [i, t] of this.trail) {
      if (env.occ[i]) continue;
      const [x, y] = xy(i);
      ctx.globalAlpha = 0.28 * (1 - t.age / 60);
      ctx.fillStyle = cssVar(c, STATE_VAR[t.state]);
      const r = cell * 0.16;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Body, tail to head, slightly inset segments.
    const body = env.body();
    const bodyColor = cssVar(c, '--body');
    const inset = Math.max(1, cell * 0.08);
    body.forEach((i, k) => {
      const [x, y] = xy(i);
      ctx.fillStyle = bodyColor;
      ctx.globalAlpha = 0.45 + 0.55 * (k / Math.max(1, body.length - 1));
      ctx.fillRect(x + inset, y + inset, cell - 2 * inset, cell - 2 * inset);
    });
    ctx.globalAlpha = 1;

    // Food.
    if (env.food >= 0) {
      const [x, y] = xy(env.food);
      ctx.fillStyle = cssVar(c, '--food');
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head: colored by the tier that decided the last move, with an eye pointing forward.
    if (body.length) {
      const hIdx = env.head();
      const [x, y] = xy(hIdx);
      ctx.fillStyle = cssVar(c, STATE_VAR[last]);
      ctx.fillRect(x + inset * 0.5, y + inset * 0.5, cell - inset, cell - inset);
      ctx.fillStyle = cssVar(c, '--board');
      const ex = x + cell / 2 + DX[env.heading] * cell * 0.22;
      const ey = y + cell / 2 + DY[env.heading] * cell * 0.22;
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
