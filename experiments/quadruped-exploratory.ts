/**
 * EXPLORATORY (post hoc, not pre-registered): after the quadruped spike stopped (EXPERIMENTS.md,
 * decisions 27–29), does System One drive the robot well even if it imitates the planner poorly?
 * The spike's verdict is unchanged; this measures what it did not: the ensemble driving alone.
 *
 * Data: 400 planner-driven training episodes, then per network size 2 DAgger rounds of 50 episodes
 * (the ensemble drives, the planner labels), collected on all cores. Sizes: 5 × 64×64 (the spike's)
 * and 5 × 256×256. Evaluation on dev seeds 10001–10020 with pushes (J = 8 N·s): falls and distance of
 * the ensemble alone, against the base controller and the planner; agreement and AUROC on the
 * planner-visited states of 10 dev episodes, as in the spike.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { mean } from '../src/core/stats';
import { seedsFor, TRAIN_SEED_START } from '../src/eval';
import { quadrupedAgrees } from '../src/games/registry';
import { Ensemble, exportEnsemble, type EnsembleConfig } from '../src/nn';
import { auroc, type ExperimentResult } from './common';
import type { Driver, WorkerTask } from './workers/quadruped-worker';

const J = 8;
/** QUAD_SMOKE=1 shrinks every count to check the pipeline end to end; never used for reported results. */
const SMOKE = process.env.QUAD_SMOKE === '1';
const BOOTSTRAP = SMOKE ? 14 : 400;
const DAGGER_ROUNDS = 2;
const DAGGER_EPISODES = SMOKE ? 4 : 50;
const CALIBRATION = SMOKE ? 4 : 20;
const EPOCHS = { bootstrap: 6, dagger: 2 };
const SIZES: Array<[number, number]> = [
  [64, 64],
  [256, 256],
];
const INPUTS = 46;
const DIM = 4;

type Reply = { id: number; error?: string; [k: string]: unknown };
/** Omit applied to each member of a union (plain Omit merges the variants). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type TaskInput = DistributiveOmit<WorkerTask, 'id'>;

/** A thread pool with a shared queue: each task goes to the next free worker; replies come back by id. */
class Pool {
  private readonly workers: Worker[];
  private readonly idle: Worker[] = [];
  private readonly queue: Array<{ task: WorkerTask; resolve: (r: Reply) => void; reject: (e: Error) => void }> = [];
  private readonly pending = new Map<number, { worker: Worker; resolve: (r: Reply) => void; reject: (e: Error) => void }>();
  private nextId = 0;

  constructor(size: number) {
    const entry = new URL('./workers/quadruped-worker.ts', import.meta.url).href;
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./workers/bootstrap.mjs', import.meta.url), { workerData: { entry } });
      w.on('message', (r: Reply) => {
        const p = this.pending.get(r.id)!;
        this.pending.delete(r.id);
        this.idle.push(p.worker);
        if (r.error) p.reject(new Error(r.error));
        else p.resolve(r);
        this.pump();
      });
      this.idle.push(w);
      return w;
    });
  }

  run(task: TaskInput): Promise<Reply> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task: { ...task, id: this.nextId++ } as WorkerTask, resolve, reject });
      this.pump();
    });
  }

  /** Sends a task to one specific worker (for workers that keep state, like ensemble members). */
  runOn(i: number, task: TaskInput, transfer: ArrayBuffer[] = []): Promise<Reply> {
    const worker = this.workers[i];
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { worker, resolve, reject });
      this.idle.splice(this.idle.indexOf(worker), 1);
      worker.postMessage({ ...task, id }, transfer);
    });
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!;
      const { task, resolve, reject } = this.queue.shift()!;
      this.pending.set(task.id, { worker: w, resolve, reject });
      w.postMessage(task);
    }
  }

  close(): Promise<number[]> {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}

interface Data {
  xs: Float32Array[];
  ys: Float64Array[];
}

async function collect(pool: Pool, seeds: number[], driver: Driver): Promise<Data> {
  const replies = await Promise.all(seeds.map((seed) => pool.run({ type: 'collect', seed, J, driver })));
  const data: Data = { xs: [], ys: [] };
  for (const r of replies) {
    const X = r.xs as Float32Array;
    const Y = r.ys as Float64Array;
    for (let i = 0; i < Y.length / DIM; i++) {
      data.xs.push(X.slice(i * INPUTS, (i + 1) * INPUTS));
      data.ys.push(Y.slice(i * DIM, (i + 1) * DIM));
    }
  }
  return data;
}

async function play(pool: Pool, seeds: number[], driver: Driver): Promise<Array<{ fell: boolean; distance: number }>> {
  return (await Promise.all(seeds.map((seed) => pool.run({ type: 'play', seed, J, driver })))).map((r) => r.result as { fell: boolean; distance: number });
}

/** Trains every member in its own thread (members are independent), then copies the weights back. */
async function trainParallel(pool: Pool, e: Ensemble, data: Data, epochs: number): Promise<void> {
  const n = data.xs.length;
  const members = e.config.members;
  await Promise.all(
    Array.from({ length: members }, (_, k) => {
      const xs = new Float32Array(n * INPUTS);
      const targets = new Float32Array(n * DIM);
      data.xs.forEach((x, i) => xs.set(x, i * INPUTS));
      data.ys.forEach((y, i) => targets.set(e.normalize(y), i * DIM));
      return pool.runOn(k, { type: 'member-train', xs, targets, n, epochs }, [xs.buffer, targets.buffer]).then((r) => e.members[k].params.set(r.params as Float32Array));
    }),
  );
}

const summarise = (runs: Array<{ fell: boolean; distance: number }>) => ({ falls: runs.filter((r) => r.fell).length, meanDistance: mean(runs.map((r) => r.distance)) });

export async function run(): Promise<ExperimentResult> {
  const workers = Math.max(1, availableParallelism() - 2);
  const pool = new Pool(workers);
  const dev20 = seedsFor('dev', SMOKE ? 4 : 20);
  const dev10 = seedsFor('dev', SMOKE ? 2 : 10);
  const train = (from: number, n: number) => Array.from({ length: n }, (_, i) => TRAIN_SEED_START + from + i);
  const t0 = performance.now();
  const log = (msg: string) => console.log(`[${((performance.now() - t0) / 60000).toFixed(1)} min] ${msg}`);

  log(`references on ${dev20.length} dev seeds (base controller, planner)…`);
  const base = summarise(await play(pool, dev20, 'base'));
  const planner = summarise(await play(pool, dev20, 'planner'));
  log(`base ${JSON.stringify(base)}, planner ${JSON.stringify(planner)}`);

  log(`bootstrap: ${BOOTSTRAP} planner-driven training episodes on ${workers} threads…`);
  const bootstrap = await collect(pool, train(950_000, BOOTSTRAP), 'planner');
  const calibration = await collect(pool, train(960_000, CALIBRATION), 'planner');
  const devStates = await collect(pool, dev10, 'planner');
  log(`${bootstrap.xs.length} training states, ${calibration.xs.length} calibration, ${devStates.xs.length} dev`);

  const results: Record<string, unknown> = {};
  for (const hidden of SIZES) {
    const name = `${hidden[0]}x${hidden[1]}`;
    const config: EnsembleConfig = { inputSize: INPUTS, hidden, low: [-1, -1, -1, -1], high: [1, 1, 1, 1], members: 5, seed: 1 };
    const ensemble = new Ensemble(config);
    await Promise.all(Array.from({ length: config.members }, (_, k) => pool.runOn(k, { type: 'member-init', config, k })));
    const data: Data = { xs: [...bootstrap.xs], ys: [...bootstrap.ys] };
    await trainParallel(pool, ensemble, data, EPOCHS.bootstrap);
    for (let round = 0; round < DAGGER_ROUNDS; round++) {
      log(`${name}: DAgger round ${round + 1}…`);
      const driver: Driver = { key: `${name}-r${round}`, model: exportEnsemble(ensemble) };
      const more = await collect(pool, train(970_000 + (hidden[0] === 64 ? 0 : 10_000) + round * 1000, DAGGER_EPISODES), driver);
      data.xs.push(...more.xs);
      data.ys.push(...more.ys);
      await trainParallel(pool, ensemble, data, EPOCHS.dagger);
    }
    ensemble.fitConfidence(calibration.xs, calibration.ys, quadrupedAgrees);

    const agree: boolean[] = [];
    const disagreement: number[] = [];
    devStates.xs.forEach((x, i) => {
      const d = ensemble.decide(x);
      agree.push(quadrupedAgrees(d.action, devStates.ys[i]));
      disagreement.push(d.disagreement);
    });
    const alone = summarise(await play(pool, dev20, { key: `${name}-final`, model: exportEnsemble(ensemble) }));
    results[name] = {
      params: ensemble.members.reduce((a, m) => a + m.numParams, 0),
      trainingStates: data.xs.length,
      agreement: agree.filter(Boolean).length / agree.length,
      auroc: auroc(disagreement, agree.map((a) => !a)),
      alone,
      aloneDistanceVsPlanner: alone.meanDistance / planner.meanDistance,
      aloneDistanceVsBase: alone.meanDistance / base.meanDistance,
    };
    log(`${name}: ${JSON.stringify(results[name])}`);
  }
  await pool.close();
  return {
    claim: 'Exploratory (post hoc): the quadruped System One driving alone, with 10× the spike data and two network sizes.',
    split: 'dev',
    seeds: [...dev20],
    config: { exploratory: true, J, bootstrapEpisodes: BOOTSTRAP, daggerRounds: DAGGER_ROUNDS, daggerEpisodes: DAGGER_EPISODES, calibrationEpisodes: CALIBRATION, epochs: EPOCHS, sizes: SIZES, workers },
    results: { base, planner, ...results },
  };
}
