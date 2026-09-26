/**
 * Round touchpad: captures one character as strokes from finger, pen or mouse (pointer events),
 * draws the ink as it is written, and commits the character 600 ms after the last pointer-up.
 * A stroke that starts before then belongs to the same character, so multistroke letters work.
 * `onInk` sees the letter in progress after every pointer event (the live network view).
 */
export const COMMIT_DELAY_MS = 600;

export class Pad {
  private readonly ctx: CanvasRenderingContext2D;
  private strokes: number[][] = [];
  private current: number[] | null = null;
  private pointerId: number | null = null;
  private timer: number | undefined;
  private fade = 1;
  private fadeStart = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onCommit: (strokes: number[][]) => void,
    private readonly onStart: () => void = () => {},
    private readonly onInk: (strokes: readonly number[][]) => void = () => {},
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    this.resize();
  }

  /** Pointer position in CSS pixels relative to the pad. */
  private point(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private insideCircle(x: number, y: number): boolean {
    const r = this.canvas.clientWidth / 2;
    return Math.hypot(x - r, y - r) <= r;
  }

  private down(e: PointerEvent): void {
    if (this.pointerId !== null) return; // only the first active pointer draws
    const [x, y] = this.point(e);
    if (!this.insideCircle(x, y)) return;
    e.preventDefault();
    window.clearTimeout(this.timer);
    if (this.fade < 1) this.clearInk(); // a new letter while the last one was fading
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.current = [x, y];
    this.strokes.push(this.current);
    this.onStart();
    this.draw();
    this.onInk(this.strokes);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = this.point(ev);
      this.current.push(x, y);
    }
    this.draw();
    this.onInk(this.strokes);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.current = null;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.commit(), COMMIT_DELAY_MS);
  }

  private commit(): void {
    if (!this.strokes.length) return;
    // The ink stays on screen while it fades out.
    this.onCommit(this.strokes.map((s) => [...s]));
    this.fadeStart = performance.now();
    this.fade = 0.999;
    const tick = () => {
      if (this.fade >= 1 || this.pointerId !== null) return;
      this.fade = Math.max(0, 1 - (performance.now() - this.fadeStart) / 450);
      if (this.fade <= 0) {
        this.clearInk();
        return;
      }
      this.draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private clearInk(): void {
    this.strokes = [];
    this.fade = 1;
    this.draw();
  }

  /** Drops the letter in progress (e.g. on "clear"). */
  reset(): void {
    window.clearTimeout(this.timer);
    this.pointerId = null;
    this.current = null;
    this.clearInk();
  }

  private resize(): void {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(w * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private draw(): void {
    const { ctx } = this;
    const w = this.canvas.clientWidth;
    ctx.clearRect(0, 0, w, w);
    const alpha = this.fade < 1 ? this.fade : 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Warm, backlit ink with a soft glow, like an illuminated control surface.
    for (const [width, style, blur] of [
      [Math.max(7, w / 36), `rgba(255, 176, 96, ${0.22 * alpha})`, 14],
      [Math.max(3, w / 90), `rgba(255, 244, 230, ${alpha})`, 4],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      ctx.shadowColor = `rgba(255, 170, 90, ${0.8 * alpha})`;
      ctx.shadowBlur = blur;
      for (const s of this.strokes) {
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        if (s.length === 2) ctx.lineTo(s[0] + 0.01, s[1]);
        for (let i = 2; i + 1 < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
