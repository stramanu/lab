/**
 * A pool of evaluation worker threads. Each condition's seeds are split into contiguous chunks,
 * played in parallel, and merged back in seed order, so every reported number equals the
 * sequential evaluation's (wall-clock timings excepted).
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { summarise, type Condition, type ConditionResult, type EpisodeRecord } from '../src/eval/runner';
import type { PlannerEpisode } from '../src/training/continuous-pipeline';
import type { ConditionOptions } from './lib';
import type { BootstrapTask, EvalTask } from './eval-worker';

type Bootstrap = { n: number; states: Float32Array; labels: Float64Array; score: number };

/** Default worker count: the number of cores minus 2, at least 1. */
export const defaultWorkers = () => Math.max(1, availableParallelism() - 2);

export class EvalPool {
  private readonly workers: Worker[];
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (r: never) => void; reject: (e: Error) => void }>();

  constructor(readonly size = defaultWorkers()) {
    // Workers run the same TypeScript sources: the bootstrap registers tsx's loader in each thread.
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./eval-worker-bootstrap.mjs', import.meta.url));
      w.on('message', (msg: { id: number; records?: EpisodeRecord[]; bootstrap?: Bootstrap; error?: string }) => {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve((msg.records ?? msg.bootstrap) as never);
      });
      w.on('error', (err: Error) => {
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      });
      return w;
    });
  }

  private run(worker: Worker, task: Omit<EvalTask, 'id'>): Promise<EpisodeRecord[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...task, id } satisfies EvalTask);
    });
  }

  private runBootstrap(worker: Worker, task: Omit<BootstrapTask, 'id'>): Promise<Bootstrap> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...task, id } satisfies BootstrapTask);
    });
  }

  /**
   * Planner-driven bootstrap episodes of a continuous game, one per seed, returned in seed order.
   * Each worker takes the next seed when it finishes one, so short (fallen) episodes do not leave cores idle.
   */
  async bootstrapEpisodes(game: string, level: number, seeds: number[], onEpisode?: (done: number) => void): Promise<PlannerEpisode[]> {
    const out: PlannerEpisode[] = new Array(seeds.length);
    let next = 0;
    let done = 0;
    await Promise.all(
      this.workers.map(async (w) => {
        while (next < seeds.length) {
          const i = next++;
          const b = await this.runBootstrap(w, { kind: 'bootstrap', game, level, seed: seeds[i] });
          const dim = b.n ? b.states.length / b.n : 0;
          const adim = b.n ? b.labels.length / b.n : 0;
          out[i] = {
            states: Array.from({ length: b.n }, (_, k) => b.states.slice(k * dim, (k + 1) * dim)),
            labels: Array.from({ length: b.n }, (_, k) => b.labels.slice(k * adim, (k + 1) * adim)),
            score: b.score,
          };
          onEpisode?.(++done);
        }
      }),
    );
    return out;
  }

  /** Evaluates one condition on `seeds`, split across the workers; identical to the sequential result. */
  async runCondition(
    game: string,
    modelDir: string,
    options: ConditionOptions,
    condition: Condition,
    seeds: number[],
    referenceLevel: number,
  ): Promise<ConditionResult> {
    const chunk = Math.ceil(seeds.length / this.size);
    const parts = await Promise.all(
      this.workers
        .map((w, i) => ({ w, seeds: seeds.slice(i * chunk, (i + 1) * chunk) }))
        .filter((p) => p.seeds.length)
        .map((p) => this.run(p.w, { game, modelDir, options, condition: condition.name, seeds: p.seeds, referenceLevel })),
    );
    return summarise(condition, parts.flat());
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
