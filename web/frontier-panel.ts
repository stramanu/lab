import { cssVar, drawScatter, formatTick, type ScatterLayout, type ScatterPoint } from './charts';
import { $ } from './dom';
import { costDomain, frontierPoints, referencePoint, scoreDomain, type FrontierPoint, type StudyFile } from './frontier';

/** The cost–quality chart of the published 5-run study, with the live game's point and hover labels. */
export class FrontierPanel {
  private readonly canvas = $<HTMLCanvasElement>('frontier');
  private readonly tip = $<HTMLDivElement>('tip');
  private points: FrontierPoint[] = [];
  private layout: ScatterLayout | null = null;
  private referenceLevel = 1;

  /** `live` gives the live game's point, or null while there are too few finished episodes. */
  constructor(private readonly live: () => FrontierPoint | null) {
    this.canvas.addEventListener('pointermove', (e) => this.showTip(e.clientX, e.clientY));
    this.canvas.addEventListener('pointerdown', (e) => this.showTip(e.clientX, e.clientY));
    this.canvas.addEventListener('pointerleave', () => (this.tip.hidden = true));
    setInterval(() => this.draw(), 1000);
  }

  /** Loads a game's published study; ignores it if `current()` has changed meanwhile. */
  async load(name: string, referenceLevel: number, current: () => string): Promise<void> {
    this.points = [];
    this.referenceLevel = referenceLevel;
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    try {
      const res = await fetch(`../data/${name}-study.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const study = (await res.json()) as StudyFile;
      if (name !== current()) return; // the visitor switched game meanwhile
      this.points = frontierPoints(study);
      const ref = referencePoint(this.points, referenceLevel);
      const guard07 = this.points.find((p) => p.label.startsWith('hybrid+guard') && p.label.endsWith('@0.7'));
      $('frontier-sub').textContent =
        `Mean of ${study.runs} training runs on ${study.seeds.count} held-out ${study.split} seeds, with 95% intervals. ` +
        'Up is better, left is cheaper. The shaded target: at least 90% of the planner’s score for a tenth of its cost.';
      $('cost-context').textContent = ref ? `whole-game averages: planner ${ref.cost.toFixed(0)}${guard07 ? ` · hybrid + guard @0.7 ${guard07.cost.toFixed(0)}` : ''}` : '';
      this.draw();
    } catch (err) {
      $('frontier-sub').textContent = `Could not load the published results: ${String(err)}`;
    }
  }

  private label(p: FrontierPoint): string {
    const cost = p.zeroCost ? '0' : formatTick(Number(p.cost.toFixed(1)));
    return `${p.label} · score ${p.score.toFixed(1)}${p.ci95 ? ` ±${p.ci95.toFixed(1)}` : ''} · ${cost} units/move`;
  }

  draw(): void {
    if (!this.points.length) return;
    const root = document.documentElement;
    const color = { system2: cssVar(root, '--s2'), hybrid: cssVar(root, '--ink-3'), 'hybrid+guard': cssVar(root, '--s1'), baseline: cssVar(root, '--ink-2'), other: cssVar(root, '--ink-3') };
    const shape = { system2: 'square', hybrid: 'ring', 'hybrid+guard': 'circle', baseline: 'diamond', other: 'diamond' } as const;
    const xDomain = costDomain(this.points);
    const yDomain = scoreDomain(this.points);
    const points: ScatterPoint[] = this.points.map((p) => ({ x: p.zeroCost ? xDomain[0] : p.cost, y: p.score, yErr: p.ci95, shape: shape[p.kind], color: color[p.kind], label: this.label(p) }));
    const live = this.live();
    if (live) points.push({ x: Math.min(Math.max(live.cost, xDomain[0]), xDomain[1]), y: live.score, shape: 'ring', color: cssVar(root, '--here'), label: this.label(live), highlight: true });
    const reference = referencePoint(this.points, this.referenceLevel);
    this.layout = drawScatter(this.canvas, points, xDomain, yDomain, 'compute units per move (log)', 'mean score', (ctx, x, y) => {
      if (!reference) return;
      // H2 target region: at least 90% of the planner's score for at most a tenth of its cost.
      const x0 = x(xDomain[0]);
      const x1 = x(reference.cost / 10);
      const y0 = y(yDomain[1]);
      const y1 = y(reference.score * 0.9);
      ctx.fillStyle = cssVar(root, '--s1');
      ctx.globalAlpha = 0.09;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar(root, '--ink-3');
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('target', x0 + 4, y0 + 4);
    });
  }

  private showTip(clientX: number, clientY: number): void {
    if (!this.layout) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best: ScatterLayout['positions'][number] | null = null;
    let bestD = 14 * 14;
    for (const pos of this.layout.positions) {
      const d = (pos.px - mx) ** 2 + (pos.py - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = pos;
      }
    }
    if (!best) {
      this.tip.hidden = true;
      return;
    }
    this.tip.textContent = best.point.label;
    this.tip.hidden = false;
    this.tip.style.left = `${Math.min(Math.max(best.px, 90), rect.width - 90)}px`;
    this.tip.style.top = `${best.py}px`;
  }
}
