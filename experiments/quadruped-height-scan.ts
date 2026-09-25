/**
 * Height-scan spike for the quadruped (exploratory, dev seeds): does a System One that sees the ground
 * imitate and drive better on terrain than a blind one trained on the same data? Protocol and go/no-go
 * criteria C1–C5 are fixed in openspec/changes/add-quadruped-height-scan/design.md.
 */
import { availableParallelism } from 'node:os';
import { mean } from '../src/core/stats';
import { initQuadrupedPhysics, QuadrupedEnv, type TerrainKind } from '../src/games/quadruped';
import { quadrupedAgrees } from '../src/games/registry';
import { Ensemble, exportEnsemble, type EnsembleConfig } from '../src/nn';
import { auroc, type ExperimentResult } from './common';
import { Pool, type Reply } from './workers/pool';
import type { Driver, EnvOptions, WorkerTask } from './workers/quadruped-worker';

const SMOKE = process.env.QUAD_SMOKE === '1';
const J = 8;
const DATA_EPISODES = SMOKE ? 6 : 300;
const CALIBRATION_EPISODES = SMOKE ? 2 : 20;
const EPOCHS = SMOKE ? 1 : 12;
const EVAL_SEEDS = Array.from({ length: SMOKE ? 2 : 40 }, (_, i) => 10001 + i);
const AGREEMENT_SEEDS = Array.from({ length: SMOKE ? 1 : 10 }, (_, i) => 10041 + i);
const TERRAINS: TerrainKind[] = ['flat', 'hills', 'mixed'];
const PROPRIO = 46;
const DIM = 4;

type Task = Omit<WorkerTask, 'id'>;
interface Data {
  xs: Float32Array[];
  ys: Float64Array[];
}

async function collect(pool: Pool<WorkerTask>, seeds: number[], env: EnvOptions): Promise<Data> {
  const replies = await Promise.all(seeds.map((seed) => pool.run({ type: 'collect', seed, J, driver: 'planner', env } as Task)));
  const data: Data = { xs: [], ys: [] };
  for (const r of replies) {
    const X = r.xs as Float32Array;
    const Y = r.ys as Float64Array;
    const inputs = X.length / (Y.length / DIM);
    for (let i = 0; i < Y.length / DIM; i++) {
      data.xs.push(X.slice(i * inputs, (i + 1) * inputs));
      data.ys.push(Y.slice(i * DIM, (i + 1) * DIM));
    }
  }
  return data;
}

async function play(pool: Pool<WorkerTask>, driver: Driver, env: EnvOptions): Promise<{ distance: number; falls: number }> {
  const rs = (await Promise.all(EVAL_SEEDS.map((seed) => pool.run({ type: 'play', seed, J, driver, env } as Task)))).map((r: Reply) => r.result as { fell: boolean; distance: number });
  return { distance: mean(rs.map((r) => r.distance)), falls: rs.filter((r) => r.fell).length };
}

/** Trains every member in its own thread (members are independent), then copies the weights back. */
async function trainParallel(pool: Pool<WorkerTask>, e: Ensemble, data: Data, inputs: number): Promise<void> {
  const n = data.xs.length;
  await Promise.all(Array.from({ length: e.config.members }, (_, k) => pool.runOn(k, { type: 'member-init', config: e.config, k } as Task)));
  await Promise.all(
    Array.from({ length: e.config.members }, (_, k) => {
      const xs = new Float32Array(n * inputs);
      const targets = new Float32Array(n * DIM);
      data.xs.forEach((x, i) => xs.set(x.subarray(0, inputs), i * inputs));
      data.ys.forEach((y, i) => targets.set(e.normalize(y), i * DIM));
      return pool.runOn(k, { type: 'member-train', xs, targets, n, epochs: EPOCHS } as Task, [xs.buffer, targets.buffer]).then((r) => e.members[k].params.set(r.params as Float32Array));
    }),
  );
}

/** Environment time per decision (ms), without and with the scan, on one mixed-terrain episode (C1). */
async function scanCost(): Promise<{ blindMs: number; scanMs: number; overhead: number }> {
  await initQuadrupedPhysics();
  const time = (heightScan: boolean) => {
    const env = new QuadrupedEnv({ heightScan, terrain: { ...new QuadrupedEnv().config.terrain, kind: 'mixed' } });
    env.reset(10001);
    const t0 = performance.now();
    let n = 0;
    while (!env.isDone()) {
      env.encode();
      env.advance([0, 0, 0, 0]);
      n++;
    }
    const ms = (performance.now() - t0) / n;
    env.dispose();
    return ms;
  };
  time(false); // warm-up
  const blindMs = mean([time(false), time(false), time(false)]);
  const scanMs = mean([time(true), time(true), time(true)]);
  return { blindMs, scanMs, overhead: scanMs / blindMs - 1 };
}

export async function run(): Promise<ExperimentResult> {
  const t0 = performance.now();
  const log = (msg: string) => console.log(`[${((performance.now() - t0) / 60000).toFixed(1)} min] ${msg}`);
  const cost = await scanCost();
  log(`C1 cost: ${cost.blindMs.toFixed(2)} → ${cost.scanMs.toFixed(2)} ms per decision (+${(100 * cost.overhead).toFixed(1)}%)`);

  const pool = new Pool<WorkerTask>(new URL('./workers/quadruped-worker.ts', import.meta.url), Math.max(1, availableParallelism() - 2));
  try {
    const scanEnv = (terrain: TerrainKind): EnvOptions => ({ terrain, heightScan: true });
    log(`data: ${DATA_EPISODES} planner-driven episodes on varied terrain…`);
    const data = await collect(pool, Array.from({ length: DATA_EPISODES }, (_, i) => 4_000_000 + i), scanEnv('varied'));
    const calibration = await collect(pool, Array.from({ length: CALIBRATION_EPISODES }, (_, i) => 4_100_000 + i), scanEnv('varied'));
    const devStates = Object.fromEntries(await Promise.all(TERRAINS.map(async (t) => [t, await collect(pool, AGREEMENT_SEEDS, scanEnv(t))] as const)));
    log(`${data.xs.length} training states, ${calibration.xs.length} calibration states`);

    const planner = Object.fromEntries(await Promise.all(TERRAINS.map(async (t) => [t, await play(pool, 'planner', { terrain: t })] as const)));
    log(`planner: ${JSON.stringify(planner)}`);

    const results: Record<string, unknown> = {};
    const nets: Record<string, { inputs: number; heightScan: boolean }> = { blind: { inputs: PROPRIO, heightScan: false }, scan: { inputs: data.xs[0].length, heightScan: true } };
    for (const [name, { inputs, heightScan }] of Object.entries(nets)) {
      const config: EnsembleConfig = { inputSize: inputs, hidden: [256, 256], low: [-1, -1, -1, -1], high: [1, 1, 1, 1], members: 5, seed: 1 };
      const ensemble = new Ensemble(config);
      log(`${name}: training on ${inputs} inputs…`);
      await trainParallel(pool, ensemble, data, inputs);
      ensemble.fitConfidence(calibration.xs.map((x) => x.subarray(0, inputs)), calibration.ys, quadrupedAgrees);
      const perTerrain: Record<string, unknown> = {};
      for (const t of TERRAINS) {
        const agree: boolean[] = [];
        const confidence: number[] = [];
        devStates[t].xs.forEach((x, i) => {
          const d = ensemble.decide(x.subarray(0, inputs));
          agree.push(quadrupedAgrees(d.action, devStates[t].ys[i]));
          confidence.push(d.confidence);
        });
        const alone = await play(pool, { key: `${name}`, model: exportEnsemble(ensemble) }, { terrain: t, heightScan });
        perTerrain[t] = {
          agreement: agree.filter(Boolean).length / agree.length,
          auroc: auroc(confidence.map((c) => 1 - c), agree.map((a) => !a)),
          meanConfidence: mean(confidence),
          alone,
          aloneVsPlanner: alone.distance / planner[t].distance,
        };
        log(`${name} ${t}: ${JSON.stringify(perTerrain[t])}`);
      }
      results[name] = { params: ensemble.members.reduce((a, m) => a + m.numParams, 0), perTerrain };
    }

    // Go / no-go criteria (design.md).
    type T = { agreement: number; aloneVsPlanner: number; alone: { distance: number } };
    const r = (net: string, t: string) => (results[net] as { perTerrain: Record<string, T> }).perTerrain[t];
    const criteria = {
      C1: { measured: cost.overhead, pass: cost.overhead < 0.1 },
      C3: { measured: { hills: r('scan', 'hills').agreement - r('blind', 'hills').agreement, mixed: r('scan', 'mixed').agreement - r('blind', 'mixed').agreement }, pass: r('scan', 'hills').agreement - r('blind', 'hills').agreement >= 0.05 && r('scan', 'mixed').agreement - r('blind', 'mixed').agreement >= 0.05 },
      C4: { measured: r('scan', 'hills').aloneVsPlanner, pass: r('scan', 'hills').aloneVsPlanner >= 0.85 },
      C5: { measured: r('scan', 'flat').alone.distance / r('blind', 'flat').alone.distance, pass: r('scan', 'flat').alone.distance / r('blind', 'flat').alone.distance >= 0.95 },
    };
    for (const [id, c] of Object.entries(criteria)) log(`${id} ${c.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(c.measured)}`);
    return {
      claim: 'Exploratory spike: a height scan lets the quadruped System One imitate and drive better on terrain than a blind one trained on the same planner data.',
      split: 'dev',
      seeds: [...EVAL_SEEDS, ...AGREEMENT_SEEDS],
      config: { J, dataEpisodes: DATA_EPISODES, calibrationEpisodes: CALIBRATION_EPISODES, epochs: EPOCHS, hidden: [256, 256], terrains: TERRAINS, smoke: SMOKE },
      results: { cost, planner, networks: results, criteria, trainingStates: data.xs.length },
    };
  } finally {
    await pool.close();
  }
}
