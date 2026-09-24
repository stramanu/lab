import type { Env } from '../src/core/types';
import type { WarehouseEnv } from '../src/games/warehouse/env';
import { cssVar, fitCanvas } from './charts';
import { STATE_VAR, type BoardView, type DecisionState } from './game-view';

/**
 * Top view of the warehouse: shelves, stations and the fleet. Each robot is
 * coloured by who decided its last move; filled when heading to a shelf,
 * hollow when heading to a station, with a faint line to its goal. The robot
 * about to decide is ringed.
 */
export class WarehouseView implements BoardView {
  private lastState: DecisionState[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(): void {
    this.lastState = [];
  }

  record(e: Env, state: DecisionState): void {
    const env = e as WarehouseEnv;
    // The robot that just decided: the previous one in this timestep, or the last of the previous timestep.
    const robot = env.turn > 0 ? (env.start + env.turn - 1) % env.n : (env.start - 2 + 2 * env.n) % env.n;
    this.lastState[robot] = state;
  }

  draw(e: Env): void {
    const env = e as WarehouseEnv;
    const { ctx, w, h } = fitCanvas(this.canvas);
    const c = this.canvas;
    const l = env.layout;
    const cell = Math.min(w / l.width, h / l.height);
    const ox = (w - cell * l.width) / 2;
    const oy = (h - cell * l.height) / 2;
    const cx = (i: number) => ox + ((i % l.width) + 0.5) * cell;
    const cy = (i: number) => oy + (((i / l.width) | 0) + 0.5) * cell;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssVar(c, '--board');
    ctx.fillRect(ox, oy, cell * l.width, cell * l.height);
    ctx.strokeStyle = cssVar(c, '--board-grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < l.width; x++) {
      const p = Math.round(ox + x * cell) + 0.5;
      ctx.moveTo(p, oy);
      ctx.lineTo(p, oy + cell * l.height);
    }
    for (let y = 1; y < l.height; y++) {
      const p = Math.round(oy + y * cell) + 0.5;
      ctx.moveTo(ox, p);
      ctx.lineTo(ox + cell * l.width, p);
    }
    ctx.stroke();

    // Shelves and walls.
    ctx.fillStyle = cssVar(c, '--body');
    for (let i = 0; i < l.blocked.length; i++) {
      if (!l.blocked[i]) continue;
      ctx.globalAlpha = (i % l.width === 0 || i % l.width === l.width - 1) ? 0.35 : 0.8;
      ctx.fillRect(ox + (i % l.width) * cell + 1, oy + ((i / l.width) | 0) * cell + 1, cell - 2, cell - 2);
    }
    ctx.globalAlpha = 1;
    // Stations.
    ctx.fillStyle = cssVar(c, '--food');
    for (const s of l.stations) ctx.fillRect(ox + (s % l.width) * cell + cell * 0.15, oy + ((s / l.width) | 0) * cell + cell * 0.15, cell * 0.7, cell * 0.7);

    // Goal lines, then robots.
    for (let r = 0; r < env.n; r++) {
      const color = cssVar(c, STATE_VAR[this.lastState[r] ?? 'system1']);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx(env.pos[r]), cy(env.pos[r]));
      ctx.lineTo(cx(env.goal[r]), cy(env.goal[r]));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const current = env.isDone() ? -1 : env.current;
    for (let r = 0; r < env.n; r++) {
      const color = cssVar(c, STATE_VAR[this.lastState[r] ?? 'system1']);
      const x = cx(env.pos[r]);
      const y = cy(env.pos[r]);
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.36, 0, Math.PI * 2);
      if (env.goalKind[r] === 0) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.fillStyle = cssVar(c, '--board');
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, cell * 0.14);
        ctx.stroke();
      }
      if (r === current) {
        ctx.strokeStyle = cssVar(c, '--ink');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.52, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.fillStyle = cssVar(c, '--ink-2');
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`t ${env.t}/${env.config.timesteps} · ${env.deliveries} deliveries · ${env.collisions} collisions`, ox + 4, oy + cell * l.height - 4);
  }
}
