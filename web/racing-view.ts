import type { Env } from '../src/core/types';
import type { RacingEnv } from '../src/games/racing/env';
import { cssVar, fitCanvas } from './charts';
import { STATE_VAR, type BoardView, type DecisionState } from './game-view';
import { LapTimer } from './laps';

const TRAIL = 400;
const ZOOM = 5; // pixels per metre at the base canvas size

export type RacingCamera = 'chase' | 'track';
export type RacingTrail = 'decider' | 'speed';

interface TrailPoint {
  x: number;
  y: number;
  state: DecisionState;
  speed: number;
  braking: boolean;
}

/**
 * Racing view: track band, the live car and an optional planner ghost, a trail
 * coloured by decider or by speed (with braking points), lap times, and a chase
 * or full-track camera with a minimap.
 */
export class RacingView implements BoardView {
  camera: RacingCamera = 'chase';
  trailMode: RacingTrail = 'decider';
  ghost: RacingEnv | null = null;
  readonly laps = new LapTimer();
  private trail: TrailPoint[] = [];
  private ghostTrail: Array<{ x: number; y: number }> = [];
  private lastSpeed = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(): void {
    this.trail = [];
    this.ghostTrail = [];
    this.laps.reset();
    this.lastSpeed = 0;
  }

  record(e: Env, state: DecisionState): void {
    const env = e as RacingEnv;
    const car = env.car;
    this.trail.push({ x: car.x, y: car.y, state, speed: car.speed, braking: car.speed < this.lastSpeed - 0.05 });
    this.lastSpeed = car.speed;
    if (this.trail.length > TRAIL) this.trail.shift();
    this.laps.update(car.progress, car.time, env.track.length);
    if (this.ghost) {
      this.ghostTrail.push({ x: this.ghost.car.x, y: this.ghost.car.y });
      if (this.ghostTrail.length > TRAIL) this.ghostTrail.shift();
    }
  }

  draw(e: Env, last: DecisionState): void {
    const env = e as RacingEnv;
    const { ctx, w, h } = fitCanvas(this.canvas);
    const c = this.canvas;
    const t = env.track;
    const car = env.car;

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
    const margin = t.width;
    const trackScale = Math.min(w / (maxX - minX + 2 * margin), h / (maxY - minY + 2 * margin));
    const chase = this.camera === 'chase';
    const scale = chase ? (ZOOM * Math.min(w, h)) / 480 : trackScale;
    const centerX = chase ? car.x : (minX + maxX) / 2;
    const centerY = chase ? car.y : (minY + maxY) / 2;
    const sx = (x: number) => w / 2 + (x - centerX) * scale;
    const sy = (y: number) => h / 2 - (y - centerY) * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssVar(c, '--board');
    ctx.fillRect(0, 0, w, h);

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

    // Ghost trail (thin, neutral).
    if (this.ghost && this.ghostTrail.length > 1) {
      ctx.strokeStyle = cssVar(c, '--ink-3');
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      this.ghostTrail.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Live trail: by decider, or by speed with braking points.
    const maxSpeed = 40; // fixed scale (m/s) so colours are comparable over time
    const slow = cssVar(c, '--food');
    const fast = cssVar(c, '--s2');
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      if (this.trailMode === 'speed') {
        ctx.strokeStyle = mix(slow, fast, b.speed / maxSpeed);
        ctx.globalAlpha = 0.9;
      } else {
        ctx.strokeStyle = cssVar(c, STATE_VAR[b.state]);
        ctx.globalAlpha = 0.25 + 0.75 * (i / this.trail.length);
      }
      ctx.lineWidth = chase ? 2.5 : 2;
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      ctx.lineTo(sx(b.x), sy(b.y));
      ctx.stroke();
      if (this.trailMode === 'speed' && b.braking && !a.braking) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cssVar(c, '--ink');
        ctx.beginPath();
        ctx.arc(sx(b.x), sy(b.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (this.ghost) this.drawCar(ctx, sx, sy, scale, this.ghost.car.x, this.ghost.car.y, this.ghost.car.heading, this.ghost.car.steer, cssVar(c, '--ink-3'), 0.45);
    this.drawCar(ctx, sx, sy, scale, car.x, car.y, car.heading, car.steer, cssVar(c, STATE_VAR[last]), 1, car.sliding ? cssVar(c, '--guard') : null);

    if (chase) this.drawMinimap(ctx, env, w, minX, maxX, minY, maxY, last);

    // Readouts (bottom-left): speed, laps, gap to the ghost.
    ctx.fillStyle = cssVar(c, '--ink');
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const fmt = (s: number | null) => (s === null ? '–' : `${s.toFixed(1)} s`);
    const lines = [
      `${(car.speed * 3.6).toFixed(0)} km/h${car.sliding ? ' · sliding' : ''}`,
      `lap ${this.laps.laps + 1} · ${fmt(this.laps.current(car.time))}`,
      `last ${fmt(this.laps.last)} · best ${fmt(this.laps.best)}`,
    ];
    if (this.ghost) {
      const gap = car.progress - this.ghost.car.progress;
      lines.push(`vs planner ghost: ${gap >= 0 ? '+' : ''}${gap.toFixed(0)} m`);
    }
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const boxH = lines.length * 16 + 8;
    ctx.fillStyle = cssVar(c, '--panel');
    ctx.globalAlpha = 0.85;
    ctx.fillRect(4, h - boxH - 4, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar(c, '--ink');
    lines.reverse().forEach((line, i) => ctx.fillText(line, 12, h - 10 - i * 16));
    if (car.end === 'off-track') {
      ctx.fillStyle = cssVar(c, '--s2');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OFF TRACK', w / 2, h / 2 - 30);
    }
  }

  private drawCar(
    ctx: CanvasRenderingContext2D,
    sx: (x: number) => number,
    sy: (y: number) => number,
    scale: number,
    x: number,
    y: number,
    heading: number,
    steer: number,
    color: string,
    alpha: number,
    outline: string | null = null,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx(x), sy(y));
    ctx.rotate(-heading);
    const L = Math.max(6, 4.4 * scale);
    const W = Math.max(3, 2 * scale);
    ctx.fillStyle = cssVar(this.canvas, '--ink');
    for (const wy of [-W * 0.55, W * 0.55]) ctx.fillRect(-L * 0.32 - L * 0.09, wy - W * 0.12, L * 0.18, W * 0.24);
    for (const wy of [-W * 0.55, W * 0.55]) {
      ctx.save();
      ctx.translate(L * 0.32, wy);
      ctx.rotate(-steer);
      ctx.fillRect(-L * 0.09, -W * 0.12, L * 0.18, W * 0.24);
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.lineTo(L * 0.3, -W / 2);
    ctx.lineTo(-L / 2, -W / 2);
    ctx.lineTo(-L / 2, W / 2);
    ctx.lineTo(L * 0.3, W / 2);
    ctx.closePath();
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, env: RacingEnv, w: number, minX: number, maxX: number, minY: number, maxY: number, last: DecisionState): void {
    const c = this.canvas;
    const t = env.track;
    const h = this.canvas.clientHeight;
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
    const dot = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox + (x - minX) * ms, oy + size - (y - minY) * ms, 3.5, 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.ghost) dot(this.ghost.car.x, this.ghost.car.y, cssVar(c, '--ink-3'));
    dot(env.car.x, env.car.y, cssVar(c, STATE_VAR[last]));
  }
}

/** Linear mix of two #rrggbb (or rgb()) colours. */
function mix(a: string, b: string, t: number): string {
  const parse = (s: string) => {
    const v = s.trim();
    if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    const m = v.match(/\d+(\.\d+)?/g);
    return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  };
  const [x, y] = [parse(a), parse(b)];
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}
