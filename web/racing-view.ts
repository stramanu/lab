import type { Env } from '../src/core/types';
import type { RacingEnv } from '../src/games/racing/env';
import { cssVar, fitCanvas } from './charts';
import { STATE_VAR, type BoardView, type DecisionState } from './game-view';

const TRAIL = 400;
const ZOOM = 5; // pixels per metre at the base canvas size

/** Chase view of the racing car: track band with kerbs, decider-coloured trail, car, and a minimap. */
export class RacingView implements BoardView {
  private trail: Array<{ x: number; y: number; state: DecisionState }> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(): void {
    this.trail = [];
  }

  record(e: Env, state: DecisionState): void {
    const env = e as RacingEnv;
    this.trail.push({ x: env.car.x, y: env.car.y, state });
    if (this.trail.length > TRAIL) this.trail.shift();
  }

  draw(e: Env, last: DecisionState): void {
    const env = e as RacingEnv;
    const { ctx, w, h } = fitCanvas(this.canvas);
    const c = this.canvas;
    const t = env.track;
    const car = env.car;
    const scale = ZOOM * Math.min(w, h) / 480;
    // World → screen, centred on the car, north up.
    const sx = (x: number) => w / 2 + (x - car.x) * scale;
    const sy = (y: number) => h / 2 - (y - car.y) * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssVar(c, '--board');
    ctx.fillRect(0, 0, w, h);

    // Track band: a thick stroke along the centreline, then kerbs as dashed edges.
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i <= t.n; i++) {
        const k = i % t.n;
        if (i === 0) ctx.moveTo(sx(t.x[k]), sy(t.y[k]));
        else ctx.lineTo(sx(t.x[k]), sy(t.y[k]));
      }
    };
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cssVar(c, '--panel-edge');
    ctx.lineWidth = t.width * scale;
    path();
    ctx.stroke();
    ctx.strokeStyle = cssVar(c, '--board');
    ctx.lineWidth = Math.max(1, (t.width - 0.8) * scale);
    path();
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = cssVar(c, '--board-grid');
    ctx.lineWidth = 1;
    path();
    ctx.stroke();
    ctx.setLineDash([]);

    // Trail coloured by who decided each move.
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      ctx.strokeStyle = cssVar(c, STATE_VAR[b.state]);
      ctx.globalAlpha = 0.25 + 0.75 * (i / this.trail.length);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      ctx.lineTo(sx(b.x), sy(b.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Car: a 4.4 × 2 m body, front wheels turned by the steering angle.
    ctx.save();
    ctx.translate(sx(car.x), sy(car.y));
    ctx.rotate(-car.heading);
    const L = 4.4 * scale;
    const W = 2 * scale;
    ctx.fillStyle = cssVar(c, '--ink');
    for (const [wx, wy] of [[-L * 0.32, -W * 0.55], [-L * 0.32, W * 0.55]]) ctx.fillRect(wx - L * 0.09, wy - W * 0.12, L * 0.18, W * 0.24);
    for (const wy of [-W * 0.55, W * 0.55]) {
      ctx.save();
      ctx.translate(L * 0.32, wy);
      ctx.rotate(-car.steer);
      ctx.fillRect(-L * 0.09, -W * 0.12, L * 0.18, W * 0.24);
      ctx.restore();
    }
    ctx.fillStyle = cssVar(c, STATE_VAR[last]);
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.lineTo(L * 0.3, -W / 2);
    ctx.lineTo(-L / 2, -W / 2);
    ctx.lineTo(-L / 2, W / 2);
    ctx.lineTo(L * 0.3, W / 2);
    ctx.closePath();
    ctx.fill();
    if (car.sliding) {
      ctx.strokeStyle = cssVar(c, '--guard');
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // Minimap (top-right).
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < t.n; i += 4) {
      minX = Math.min(minX, t.x[i]);
      maxX = Math.max(maxX, t.x[i]);
      minY = Math.min(minY, t.y[i]);
      maxY = Math.max(maxY, t.y[i]);
    }
    const size = Math.min(w, h) * 0.26;
    const ms = size / Math.max(maxX - minX, maxY - minY);
    const ox = w - size - 10;
    const oy = 10;
    ctx.fillStyle = cssVar(c, '--panel');
    ctx.globalAlpha = 0.85;
    ctx.fillRect(ox - 6, oy - 6, size + 12, size + 12);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar(c, '--ink-3');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= t.n; i += 4) {
      const k = i % t.n;
      const mx = ox + (t.x[k] - minX) * ms;
      const my = oy + size - (t.y[k] - minY) * ms;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = cssVar(c, STATE_VAR[last]);
    ctx.beginPath();
    ctx.arc(ox + (car.x - minX) * ms, oy + size - (car.y - minY) * ms, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Speed readout (bottom-left).
    ctx.fillStyle = cssVar(c, '--ink');
    ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${(car.speed * 3.6).toFixed(0)} km/h${car.sliding ? ' · sliding' : ''}`, 12, h - 10);
    if (car.end === 'off-track') {
      ctx.fillStyle = cssVar(c, '--s2');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OFF TRACK', w / 2, h / 2 - 30);
    }
  }
}
