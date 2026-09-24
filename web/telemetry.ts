import { cssVar, fitCanvas } from './charts';

export interface TelemetrySample {
  speed: number;
  steer: number;
  pedal: number;
  escalated: boolean;
}

/** Ring buffer of the last `size` decisions of the live car. */
export class Telemetry {
  readonly samples: TelemetrySample[] = [];
  constructor(readonly size = 200) {}

  push(s: TelemetrySample): void {
    this.samples.push(s);
    if (this.samples.length > this.size) this.samples.shift();
  }

  clear(): void {
    this.samples.length = 0;
  }
}

/** Three stacked traces (speed, steering, pedal) with escalation marks along the top. */
export function drawTelemetry(canvas: HTMLCanvasElement, t: Telemetry, maxSpeed = 45, maxSteer = 0.3): void {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const left = 58;
  const top = 10;
  const rows = [
    { label: 'speed', color: cssVar(canvas, '--ink'), lo: 0, hi: maxSpeed, get: (s: TelemetrySample) => s.speed, fmt: (v: number) => `${(v * 3.6).toFixed(0)} km/h` },
    { label: 'steering', color: cssVar(canvas, '--s1'), lo: -maxSteer, hi: maxSteer, get: (s: TelemetrySample) => s.steer, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}` },
    { label: 'pedal', color: cssVar(canvas, '--guard'), lo: -1, hi: 1, get: (s: TelemetrySample) => s.pedal, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}` },
  ];
  const rowH = (h - top) / rows.length;
  const x = (i: number) => left + (i / Math.max(1, t.size - 1)) * (w - left - 6);
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  // Escalation marks across all rows.
  ctx.fillStyle = cssVar(canvas, '--s2');
  ctx.globalAlpha = 0.18;
  t.samples.forEach((s, i) => {
    if (s.escalated) ctx.fillRect(x(i) - 1, top, 2, h - top);
  });
  ctx.globalAlpha = 1;

  rows.forEach((r, k) => {
    const y0 = top + k * rowH;
    const y = (v: number) => y0 + rowH - 4 - ((v - r.lo) / (r.hi - r.lo)) * (rowH - 8);
    ctx.strokeStyle = cssVar(canvas, '--grid');
    ctx.beginPath();
    ctx.moveTo(left, y(r.lo < 0 ? 0 : r.lo) + 0.5);
    ctx.lineTo(w - 6, y(r.lo < 0 ? 0 : r.lo) + 0.5);
    ctx.stroke();
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    t.samples.forEach((s, i) => (i ? ctx.lineTo(x(i), y(r.get(s))) : ctx.moveTo(x(i), y(r.get(s)))));
    ctx.stroke();
    ctx.fillStyle = cssVar(canvas, '--ink-3');
    ctx.textAlign = 'left';
    ctx.fillText(r.label, 0, y0 + rowH / 2 - 6);
    const lastSample = t.samples[t.samples.length - 1];
    if (lastSample) {
      ctx.fillStyle = cssVar(canvas, '--ink-2');
      ctx.fillText(r.fmt(r.get(lastSample)), 0, y0 + rowH / 2 + 7);
    }
  });
}
