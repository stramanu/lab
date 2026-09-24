import type { LogEntry } from '../src/training/pipeline';
import { cssVar, drawLines } from './charts';
import { $ } from './dom';
import type { FromWorker, ToWorker, Weights } from './protocol';

export interface TrainingCallbacks {
  /** A new version of the weights (every step, and the final one). */
  onPolicy(policy: Weights, source: string): void;
  /** Training started or stopped (the page locks the game tabs and the pretrained button). */
  onRunning(running: boolean): void;
}

/** In-tab training in a Web Worker, its status line and the two per-iteration charts. */
export class TrainingPanel {
  private worker: Worker | null = null;
  running = false;
  readonly log: LogEntry[] = [];
  private scoreMax = 1;
  private readonly button = $<HTMLButtonElement>('btn-train');
  private readonly status = $('train-status');

  /** `iterations` gives the selected game's number of escalation iterations (for the status line). */
  constructor(
    private readonly callbacks: TrainingCallbacks,
    private readonly gameName: () => string,
    private readonly iterations: () => number,
  ) {
    this.button.addEventListener('click', () => (this.running ? this.stop() : this.start()));
  }

  /** Clears the charts for a newly selected game; `offline` disables training (with a reason) for slow games. */
  reset(scoreMax: number, offline: string | null): void {
    this.scoreMax = scoreMax;
    this.log.length = 0;
    this.draw();
    this.button.disabled = offline !== null;
    this.status.textContent = offline ?? 'Idle. Training takes one to two minutes on a laptop and runs in a background worker.';
  }

  private setRunning(on: boolean): void {
    this.running = on;
    this.button.textContent = on ? 'Stop training' : 'Train in this tab';
    this.button.setAttribute('aria-pressed', String(on));
    this.button.disabled = false;
    this.callbacks.onRunning(on);
  }

  private describe(e: LogEntry): string {
    const it = e.phase === 'escalation' ? `iteration ${e.iteration}/${this.iterations()}` : e.phase;
    const score = e.meanScore === null ? '' : ` · mean score ${e.meanScore.toFixed(0)}`;
    return `${it} · escalated ${(e.escalationRate * 100).toFixed(1)}% (guard ${(e.guardEscalationRate * 100).toFixed(1)}%) · agreement ${(e.valAgreement * 100).toFixed(1)}%${score} · ${e.datasetSize.toLocaleString('en-US')} examples · ${(e.elapsedMs / 1000).toFixed(0)} s`;
  }

  private stop(): void {
    this.worker?.postMessage({ type: 'stop' } satisfies ToWorker);
    this.button.textContent = 'Stopping…';
    this.button.disabled = true;
  }

  private start(): void {
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        this.log.push(msg.entry);
        this.callbacks.onPolicy(msg.policy, `trained in this tab · ${msg.entry.phase} ${msg.entry.iteration}`);
        this.status.textContent = this.describe(msg.entry);
        this.draw();
      } else if (msg.type === 'done') {
        this.callbacks.onPolicy(msg.policy, msg.completed ? 'trained in this tab · final' : 'trained in this tab · stopped early');
        this.status.textContent = `${msg.completed ? 'Done' : 'Stopped'} · ${this.log.length ? this.describe(this.log[this.log.length - 1]) : ''}`;
        this.setRunning(false);
      } else {
        this.status.textContent = `Training failed: ${msg.message}`;
        this.setRunning(false);
      }
    };
    this.worker.onerror = (e) => {
      this.status.textContent = `Worker error: ${e.message}`;
      this.setRunning(false);
    };
    this.log.length = 0;
    this.draw();
    this.status.textContent = 'Bootstrap: the planner plays the first games to create labels…';
    this.worker.postMessage({ type: 'start', game: this.gameName(), config: {} } satisfies ToWorker);
    this.setRunning(true);
  }

  /** Share of moves (escalated, by the guard, agreement) and mean score, per iteration. */
  draw(): void {
    const root = document.documentElement;
    drawLines(
      $<HTMLCanvasElement>('chart-share'),
      [
        { label: 'escalated', color: cssVar(root, '--s2'), values: this.log.map((e) => e.escalationRate) },
        { label: 'guard', color: cssVar(root, '--guard'), values: this.log.map((e) => e.guardEscalationRate), dashed: true },
        { label: 'agreement', color: cssVar(root, '--ink-2'), values: this.log.map((e) => e.valAgreement) },
      ],
      1,
      (v) => `${Math.round(v * 100)}%`,
    );
    drawLines($<HTMLCanvasElement>('chart-score'), [{ label: 'score', color: cssVar(root, '--s1'), values: this.log.map((e) => e.meanScore) }], this.scoreMax, (v) => String(v));
  }
}
