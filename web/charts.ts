/** Tiny canvas charts: linear/log scales, a multi-series line chart and a scatter plot. */

export interface Scale {
  (v: number): number;
  ticks: number[];
}

export function linearScale(d0: number, d1: number, r0: number, r1: number, tickCount = 4): Scale {
  const span = d1 - d0 || 1;
  const f = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  f.ticks = niceTicks(d0, d1, tickCount);
  return f;
}

/** Log10 scale; the domain must be positive. Ticks at powers of ten inside the domain. */
export function logScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const span = l1 - l0 || 1;
  const f = ((v: number) => r0 + ((Math.log10(v) - l0) / span) * (r1 - r0)) as Scale;
  f.ticks = [];
  for (let p = Math.ceil(l0 - 1e-9); p <= Math.floor(l1 + 1e-9); p++) f.ticks.push(10 ** p);
  return f;
}

/** Round tick values (1, 2, 5 × 10^k steps) covering [d0, d1]. */
export function niceTicks(d0: number, d1: number, count: number): number[] {
  if (!(d1 > d0)) return [d0];
  const raw = (d1 - d0) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(d0 / step) * step; v <= d1 + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export function formatTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
  if (v >= 1 || v === 0) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return v.toPrecision(2);
}

/** Resizes the canvas backing store to its CSS size × devicePixelRatio; returns CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = globalThis.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export interface Series {
  label: string;
  color: string;
  values: Array<number | null>;
  /** Plot on the right axis (0..1 share) instead of the left one. */
  dashed?: boolean;
}

const PAD = { l: 38, r: 10, t: 10, b: 22 };

function axes(ctx: CanvasRenderingContext2D, w: number, h: number, x: Scale, y: Scale, ink: string, grid: string, yFmt: (v: number) => string, xFmt: (v: number) => string) {
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const t of y.ticks) {
    const py = Math.round(y(t)) + 0.5;
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(PAD.l, py);
    ctx.lineTo(w - PAD.r, py);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillText(yFmt(t), PAD.l - 6, py);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of x.ticks) {
    const px = x(t);
    ctx.fillStyle = ink;
    ctx.fillText(xFmt(t), px, h - PAD.b + 6);
  }
}

/** Line chart over iterations; y domain [0, yMax]. */
export function drawLines(canvas: HTMLCanvasElement, series: Series[], yMax: number, yFmt: (v: number) => string): void {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const x = linearScale(0, n - 1, PAD.l, w - PAD.r, Math.min(6, n - 1));
  const y = linearScale(0, yMax, h - PAD.b, PAD.t, 4);
  axes(ctx, w, h, x, y, cssVar(canvas, '--ink-3'), cssVar(canvas, '--grid'), yFmt, (v) => String(Math.round(v)));
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 1.75;
    ctx.setLineDash(s.dashed ? [4, 3] : []);
    ctx.beginPath();
    let started = false;
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        started = false;
        return;
      }
      const px = x(i);
      const py = y(Math.min(v, yMax));
      if (started) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      started = true;
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const last = s.values.length - 1;
    const lv = s.values[last];
    if (lv !== null && lv !== undefined && Number.isFinite(lv)) {
      ctx.beginPath();
      ctx.arc(x(last), y(Math.min(lv, yMax)), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export type MarkerShape = 'square' | 'circle' | 'ring' | 'diamond';

export interface ScatterPoint {
  x: number;
  y: number;
  shape: MarkerShape;
  color: string;
  label: string;
  highlight?: boolean;
}

export interface ScatterLayout {
  x: Scale;
  y: Scale;
  /** Pixel positions of the drawn points, for hit testing. */
  positions: Array<{ px: number; py: number; point: ScatterPoint }>;
}

export function drawScatter(
  canvas: HTMLCanvasElement,
  points: ScatterPoint[],
  xDomain: [number, number],
  yDomain: [number, number],
  xLabel: string,
  yLabel: string,
  underlay?: (ctx: CanvasRenderingContext2D, x: Scale, y: Scale) => void,
): ScatterLayout {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = { ...PAD, b: 34, l: 44 };
  const x = logScale(xDomain[0], xDomain[1], pad.l, w - pad.r);
  const y = linearScale(yDomain[0], yDomain[1], h - pad.b, pad.t, 4);
  const ink = cssVar(canvas, '--ink-3');
  ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of y.ticks) {
    const py = Math.round(y(t)) + 0.5;
    ctx.strokeStyle = cssVar(canvas, '--grid');
    ctx.beginPath();
    ctx.moveTo(pad.l, py);
    ctx.lineTo(w - pad.r, py);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillText(formatTick(t), pad.l - 6, py);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of x.ticks) {
    const px = Math.round(x(t)) + 0.5;
    ctx.strokeStyle = cssVar(canvas, '--grid');
    ctx.beginPath();
    ctx.moveTo(px, pad.t);
    ctx.lineTo(px, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillText(formatTick(t), px, h - pad.b + 5);
  }
  ctx.fillText(xLabel, (pad.l + w - pad.r) / 2, h - 13);
  ctx.save();
  ctx.translate(11, (pad.t + h - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, -4);
  ctx.restore();

  underlay?.(ctx, x, y);
  const positions: ScatterLayout['positions'] = [];
  for (const p of points) {
    const px = x(Math.max(p.x, xDomain[0]));
    const py = y(p.y);
    positions.push({ px, py, point: p });
    drawMarker(ctx, p.shape, px, py, p.highlight ? 6 : 4.5, p.color);
  }
  return { x, y, positions };
}

export function drawMarker(ctx: CanvasRenderingContext2D, shape: MarkerShape, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (shape === 'diamond') {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y);
    ctx.lineTo(x, y + r * 1.2);
    ctx.lineTo(x - r * 1.2, y);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  if (shape === 'ring') ctx.stroke();
  else ctx.fill();
}
