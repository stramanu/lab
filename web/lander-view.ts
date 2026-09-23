import type { Env } from '../src/core/types';
import { LEFT, MAIN, RIGHT } from '../src/games/lander/config';
import type { LanderEnv } from '../src/games/lander/env';
import { terrainHeight, windAt } from '../src/games/lander/world';
import { cssVar, fitCanvas } from './charts';
import { STATE_VAR, type BoardView, type DecisionState } from './game-view';

const TRAIL = 240;

/** Side view of the lander: terrain, pad, ship attitude, engine flames, wind and a decider-colored trail. */
export class LanderView implements BoardView {
  private trail: Array<{ x: number; y: number; state: DecisionState }> = [];
  private lastAction = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(): void {
    this.trail = [];
    this.lastAction = 0;
  }

  record(e: Env, state: DecisionState, action: number): void {
    const env = e as LanderEnv;
    this.lastAction = action;
    this.trail.push({ x: env.state.x, y: env.state.y, state });
    if (this.trail.length > TRAIL) this.trail.shift();
  }

  draw(e: Env, last: DecisionState): void {
    const env = e as LanderEnv;
    const { ctx, w, h } = fitCanvas(this.canvas);
    const c = this.canvas;
    const W = env.config.width;
    const H = env.config.height;
    const scale = Math.min(w / W, h / H);
    const ox = (w - W * scale) / 2;
    const oy = (h - H * scale) / 2;
    const px = (x: number) => ox + x * scale;
    const py = (y: number) => oy + (H - y) * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssVar(c, '--board');
    ctx.fillRect(ox, oy, W * scale, H * scale);

    // Altitude grid every 10 m.
    ctx.strokeStyle = cssVar(c, '--board-grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 10; y < H; y += 10) {
      ctx.moveTo(px(0), Math.round(py(y)) + 0.5);
      ctx.lineTo(px(W), Math.round(py(y)) + 0.5);
    }
    ctx.stroke();

    // Terrain.
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    for (let x = 0; x <= W; x += 0.5) ctx.lineTo(px(x), py(terrainHeight(env.world, x)));
    ctx.lineTo(px(W), py(0));
    ctx.closePath();
    ctx.fillStyle = cssVar(c, '--body');
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar(c, '--body');
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pad.
    ctx.strokeStyle = cssVar(c, '--s1');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px(env.world.padX0), py(env.world.padY));
    ctx.lineTo(px(env.world.padX1), py(env.world.padY));
    ctx.stroke();

    // Trail colored by who decided each move.
    this.trail.forEach((t, i) => {
      ctx.globalAlpha = 0.15 + 0.6 * (i / this.trail.length);
      ctx.fillStyle = cssVar(c, STATE_VAR[t.state]);
      ctx.beginPath();
      ctx.arc(px(t.x), py(t.y), 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Wind arrow (top-left), scaled by the current wind.
    const wind = windAt(env.world, env.state.time, env.config);
    const ax = px(6);
    const ay = py(H - 5);
    const len = wind * 60 * scale;
    ctx.strokeStyle = cssVar(c, '--ink-3');
    ctx.fillStyle = cssVar(c, '--ink-3');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + len, ay);
    ctx.stroke();
    if (Math.abs(len) > 3) {
      const d = Math.sign(len);
      ctx.beginPath();
      ctx.moveTo(ax + len, ay);
      ctx.lineTo(ax + len - d * 5, ay - 3.5);
      ctx.lineTo(ax + len - d * 5, ay + 3.5);
      ctx.fill();
    }
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`wind ${wind >= 0 ? '→' : '←'} ${Math.abs(wind).toFixed(2)} m/s²`, px(2), ay - 6);

    // Ship: the state's (x, y) is the foot point; the body sits above it and rotates around it.
    const s = env.state;
    const size = 2.4 * scale;
    ctx.save();
    ctx.translate(px(s.x), py(s.y));
    ctx.rotate(-s.angle);
    const firing = !s.end && s.fuel > 0;
    if (firing && this.lastAction === MAIN) {
      ctx.fillStyle = cssVar(c, '--guard');
      ctx.beginPath();
      ctx.moveTo(-size * 0.22, 0);
      ctx.lineTo(size * 0.22, 0);
      ctx.lineTo(0, size * (0.7 + 0.25 * Math.random()));
      ctx.closePath();
      ctx.fill();
    }
    if (firing && (this.lastAction === LEFT || this.lastAction === RIGHT)) {
      // Counter-clockwise torque (LEFT) comes from a jet on the right side pushing up, and vice versa.
      const side = this.lastAction === LEFT ? 1 : -1;
      ctx.fillStyle = cssVar(c, '--guard');
      ctx.beginPath();
      ctx.moveTo(side * size * 0.45, -size * 0.55);
      ctx.lineTo(side * size * 0.9, -size * 0.45);
      ctx.lineTo(side * size * 0.45, -size * 0.35);
      ctx.fill();
    }
    ctx.fillStyle = cssVar(c, STATE_VAR[last]);
    ctx.strokeStyle = cssVar(c, '--ink');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.35, -size * 0.25);
    ctx.lineTo(size * 0.35, -size * 0.25);
    ctx.lineTo(size * 0.25, -size * 0.85);
    ctx.lineTo(-size * 0.25, -size * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.25);
    ctx.lineTo(-size * 0.5, 0);
    ctx.moveTo(size * 0.3, -size * 0.25);
    ctx.lineTo(size * 0.5, 0);
    ctx.stroke();
    ctx.restore();

    if (s.end) {
      ctx.fillStyle = cssVar(c, s.end === 'landed' ? '--s1' : '--s2');
      ctx.font = '600 14px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.end === 'landed' ? 'LANDED' : s.end.toUpperCase(), px(W / 2), py(H / 2));
    }
  }
}
