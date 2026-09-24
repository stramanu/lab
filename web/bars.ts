import { cssVar, fitCanvas } from './charts';

/** One horizontal bar per action with System One's probability, the choice marked, and the threshold line. */
export function drawBars(
  canvas: HTMLCanvasElement,
  labels: readonly string[],
  probs: ArrayLike<number> | null,
  chosen: number,
  played: number,
  threshold: number,
): void {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const labelW = 84;
  const valueW = 44;
  const x0 = labelW;
  const x1 = w - valueW;
  const rowH = h / labels.length;
  const barH = Math.min(18, rowH * 0.5);
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  labels.forEach((label, a) => {
    const cy = rowH * a + rowH / 2;
    const p = probs ? probs[a] : 0;
    ctx.fillStyle = cssVar(canvas, '--track');
    ctx.fillRect(x0, cy - barH / 2, x1 - x0, barH);
    ctx.fillStyle = a === chosen ? cssVar(canvas, '--s1') : cssVar(canvas, '--ink-3');
    ctx.globalAlpha = a === chosen ? 1 : 0.55;
    ctx.fillRect(x0, cy - barH / 2, (x1 - x0) * p, barH);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = cssVar(canvas, a === played ? '--ink' : '--ink-3');
    ctx.fillText((a === played ? '▸ ' : '  ') + label, 0, cy);
    ctx.textAlign = 'right';
    ctx.fillStyle = cssVar(canvas, '--ink-2');
    ctx.fillText(probs ? p.toFixed(2) : '–', w, cy);
  });

  // Threshold: System One acts alone only if its top bar reaches this line.
  const tx = Math.round(x0 + (x1 - x0) * threshold) + 0.5;
  ctx.strokeStyle = cssVar(canvas, '--s2');
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(tx, 2);
  ctx.lineTo(tx, h - 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Continuous System One: one gauge per action dimension (student value, and the
 * planner's value when it was queried), plus the confidence against the threshold.
 */
export function drawGauges(
  canvas: HTMLCanvasElement,
  labels: readonly string[],
  low: readonly number[],
  high: readonly number[],
  student: ArrayLike<number> | null,
  planner: ArrayLike<number> | null,
  confidence: number | null,
  threshold: number,
): void {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const labelW = 84;
  const valueW = 56;
  const x0 = labelW;
  const x1 = w - valueW;
  const rows = labels.length + 1;
  const rowH = h / rows;
  const barH = Math.min(14, rowH * 0.45);
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  labels.forEach((label, d) => {
    const cy = rowH * d + rowH / 2;
    const px = (v: number) => x0 + ((v - low[d]) / (high[d] - low[d])) * (x1 - x0);
    ctx.fillStyle = cssVar(canvas, '--track');
    ctx.fillRect(x0, cy - barH / 2, x1 - x0, barH);
    ctx.strokeStyle = cssVar(canvas, '--ink-3');
    ctx.beginPath();
    ctx.moveTo(px(0) + 0.5, cy - barH / 2 - 2);
    ctx.lineTo(px(0) + 0.5, cy + barH / 2 + 2);
    ctx.stroke();
    if (student) {
      const a = px(0);
      const b = px(student[d]);
      ctx.fillStyle = cssVar(canvas, '--s1');
      ctx.fillRect(Math.min(a, b), cy - barH / 2, Math.abs(b - a), barH);
    }
    if (planner) {
      ctx.fillStyle = cssVar(canvas, '--s2');
      const p = px(planner[d]);
      ctx.beginPath();
      ctx.moveTo(p, cy - barH / 2 - 5);
      ctx.lineTo(p - 4, cy - barH / 2 - 10);
      ctx.lineTo(p + 4, cy - barH / 2 - 10);
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = cssVar(canvas, '--ink-2');
    ctx.fillText(label, 0, cy);
    ctx.textAlign = 'right';
    ctx.fillText(student ? (student[d] >= 0 ? '+' : '') + student[d].toFixed(2) : '–', w, cy);
  });

  // Confidence row.
  const cy = rowH * labels.length + rowH / 2;
  ctx.fillStyle = cssVar(canvas, '--track');
  ctx.fillRect(x0, cy - barH / 2, x1 - x0, barH);
  if (confidence !== null) {
    ctx.fillStyle = cssVar(canvas, confidence >= threshold ? '--s1' : '--s2');
    ctx.fillRect(x0, cy - barH / 2, (x1 - x0) * confidence, barH);
  }
  const tx = Math.round(x0 + (x1 - x0) * threshold) + 0.5;
  ctx.strokeStyle = cssVar(canvas, '--s2');
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(tx, cy - barH);
  ctx.lineTo(tx, cy + barH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
  ctx.fillStyle = cssVar(canvas, '--ink-2');
  ctx.fillText('confidence', 0, cy);
  ctx.textAlign = 'right';
  ctx.fillText(confidence === null ? '–' : confidence.toFixed(2), w, cy);
}
