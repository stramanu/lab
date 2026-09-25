/**
 * Quadruped terrain study (openspec/changes/retrain-quadruped-terrain/design.md): each of the 5 published
 * flat networks is fine-tuned on varied terrain through the System One / System Two loop, then old and new
 * networks are evaluated on flat and mixed terrain against targets fixed in advance. Resumable: trained runs
 * and evaluated conditions are cached.
 * Usage: pnpm tsx scripts/terrain-study.ts [--split dev|test] [--seeds N] [--workers N] [--out DIR]
 *        TERRAIN_SMOKE=1 shrinks everything, for checking the pipeline only (never for reported results).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { mean } from '../src/core/stats';
import { parseSplit, seedsFor, tInterval } from '../src/eval';
import type { EpisodeRecord } from '../src/eval/runner';
import { getGame } from '../src/games/registry';
import type { TerrainKind } from '../src/games/quadruped';
import type { SerializedEnsemble } from '../src/nn';
import { DEFAULT_CONTINUOUS_PIPELINE, type ContinuousPipelineConfig } from '../src/training/continuous-pipeline';
import { Pool, type Reply } from '../experiments/workers/pool';
import { num, parseArgs } from './cli';
import type { TerrainTask } from './terrain-worker';

const args = parseArgs(process.argv.slice(2));
const SMOKE = process.env.TERRAIN_SMOKE === '1';
const split = parseSplit(args.split);
const seeds = seedsFor(split, num(args, 'seeds') ?? (SMOKE ? 2 : 100));
const ROOT = args.out ?? (SMOKE ? 'artifacts/quadruped/terrain-study-smoke' : 'artifacts/quadruped/terrain-study');
const RUNS = 5;
const TERRAINS: TerrainKind[] = ['flat', 'mixed'];
const PLANNER = 'system2 (level 2)';
const NET_CONDITIONS = ['system1', 'guard only', 'hybrid+guard ensemble@0.7', 'hybrid+guard ensemble@0.9'];
if (split === 'test') console.log('Study on the TEST split: use it only for final, published numbers.');

const pipelineConfig = (k: number): ContinuousPipelineConfig => ({
  ...DEFAULT_CONTINUOUS_PIPELINE,
  ...getGame('quadruped').continuous!.pipeline,
  seed: k,
  trainSeedStart: 3_000_000 + (k - 1) * 100_000,
  bootstrapEpisodes: SMOKE ? 2 : 100,
  bootstrapEpochs: SMOKE ? 1 : 4,
  ...(SMOKE ? { iterations: 1, maxMovesPerIteration: 30, retrainEvery: 20, consolidationEpochs: 1 } : {}),
});

type Task = Omit<Extract<TerrainTask, { type: 'bootstrap' }>, 'id'> | Omit<Extract<TerrainTask, { type: 'train' }>, 'id'> | Omit<Extract<TerrainTask, { type: 'eval' }>, 'id'>;
const pool = new Pool<TerrainTask>(new URL('./terrain-worker.ts', import.meta.url), num(args, 'workers') ?? Math.max(1, availableParallelism() - 2));
const run = (t: Task, urgent = false): Promise<Reply> => pool.run(t as Omit<TerrainTask, 'id'>, urgent);

const oldDir = (k: number) => `artifacts/quadruped/study/run-${k}`;
const newDir = (k: number) => join(ROOT, `run-${k}`);

/** Fine-tunes run k (bootstrap episodes on the pool, then the whole pipeline on one worker), unless done. */
async function train(k: number): Promise<void> {
  const dir = newDir(k);
  if (existsSync(join(dir, 'weights.json'))) return;
  const config = pipelineConfig(k);
  const bootstrapSeeds = Array.from({ length: config.bootstrapEpisodes }, (_, i) => config.trainSeedStart + i);
  // Training goes ahead of the evaluations queued meanwhile.
  const eps = await Promise.all(bootstrapSeeds.map((seed) => run({ type: 'bootstrap', seed }, true)));
  const lengths = eps.map((e) => e.n as number);
  const states = new Float32Array(eps.reduce((a, e) => a + (e.states as Float32Array).length, 0));
  const labels = new Float64Array(eps.reduce((a, e) => a + (e.labels as Float64Array).length, 0));
  let so = 0;
  let lo = 0;
  for (const e of eps) {
    states.set(e.states as Float32Array, so);
    labels.set(e.labels as Float64Array, lo);
    so += (e.states as Float32Array).length;
    lo += (e.labels as Float64Array).length;
  }
  console.log(`run ${k}: ${eps.length} bootstrap episodes, ${lengths.reduce((a, b) => a + b, 0)} states; fine-tuning…`);
  const initial = JSON.parse(readFileSync(join(oldDir(k), 'weights.json'), 'utf8')) as SerializedEnsemble;
  const r = await run({ type: 'train', config, initial, lengths, scores: eps.map((e) => e.score as number), states, labels }, true);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'train-log.json'), JSON.stringify(r.log, null, 2));
  writeFileSync(join(dir, 'weights.json'), JSON.stringify(r.weights));
  console.log(`run ${k}: trained in ${Math.round(r.seconds as number)} s`);
}

/** One condition on one terrain for one network, over all seeds (cached). */
async function evaluate(label: string, modelDir: string, terrain: TerrainKind, condition: string): Promise<EpisodeRecord[]> {
  const path = join(ROOT, 'eval', `${label}--${terrain}--${condition.replace(/[^a-z0-9.@+]+/gi, '_')}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as EpisodeRecord[];
  const replies = await Promise.all(seeds.map((seed) => run({ type: 'eval', modelDir, condition, seed, terrain })));
  const records = replies.map((r) => r.record as EpisodeRecord);
  mkdirSync(join(ROOT, 'eval'), { recursive: true });
  writeFileSync(path, JSON.stringify(records));
  const s = summary(records);
  console.log(`${label.padEnd(6)} ${terrain.padEnd(6)} ${condition.padEnd(26)} ${s.distance.toFixed(2)} m, falls ${s.falls}, cost ${s.costPerMove.toFixed(0)}, escalation ${(100 * s.escalation).toFixed(1)}%`);
  return records;
}

function summary(rs: EpisodeRecord[]) {
  const moves = rs.reduce((a, r) => a + r.moves, 0);
  const correct = rs.flatMap((r) => r.correct);
  return {
    distance: mean(rs.map((r) => r.score)),
    falls: rs.filter((r) => r.endReason === 'fall').length,
    costPerMove: rs.reduce((a, r) => a + r.cost, 0) / moves,
    escalation: rs.reduce((a, r) => a + r.escalated, 0) / moves,
    agreement: correct.length ? correct.filter(Boolean).length / correct.length : null,
  };
}
type Summary = ReturnType<typeof summary>;

async function main(): Promise<void> {
  const t0 = performance.now();
  // The old networks and the planner do not depend on the fine-tuning: they are evaluated while it runs.
  const runs = Array.from({ length: RUNS }, (_, i) => i + 1);
  const trained = runs.map((k) => train(k)); // bootstrap tasks are queued first
  const plannerDone = Promise.all(TERRAINS.map(async (t) => [t, summary(await evaluate('planner', oldDir(1), t, PLANNER))] as const));
  const results = await Promise.all(
    runs.map(async (k) => {
      const old = Promise.all(TERRAINS.flatMap((t) => NET_CONDITIONS.map(async (c) => [`${t}|${c}`, summary(await evaluate(`old-${k}`, oldDir(k), t, c))] as const)));
      await trained[k - 1];
      const fresh = await Promise.all(TERRAINS.flatMap((t) => NET_CONDITIONS.map(async (c) => [`${t}|${c}`, summary(await evaluate(`new-${k}`, newDir(k), t, c))] as const)));
      return { k, old: Object.fromEntries(await old) as Record<string, Summary>, new: Object.fromEntries(fresh) as Record<string, Summary> };
    }),
  );
  const planner = Object.fromEntries(await plannerDone) as Record<string, Summary>;
  await pool.close();

  // Targets (design.md), judged on the mean of the runs; per-run tallies alongside.
  const per = (f: (r: (typeof results)[number]) => number) => results.map(f);
  const alone = (r: (typeof results)[number], net: 'old' | 'new', t: string) => r[net][`${t}|system1`].distance;
  const h = (r: (typeof results)[number], net: 'old' | 'new', c: string) => r[net][`mixed|hybrid+guard ensemble@${c}`];
  const t1 = per((r) => alone(r, 'new', 'mixed') / planner.mixed.distance);
  const t2 = per((r) => alone(r, 'new', 'flat') / alone(r, 'old', 'flat'));
  const t3 = per((r) => h(r, 'old', '0.9').escalation - h(r, 'new', '0.9').escalation);
  const t4ok = per((r) => (h(r, 'new', '0.7').distance >= 0.95 * planner.mixed.distance && h(r, 'new', '0.7').costPerMove < h(r, 'old', '0.7').costPerMove ? 1 : 0));
  const meanNew07 = mean(per((r) => h(r, 'new', '0.7').distance));
  const target = (id: string, statement: string, values: number[], ok: (v: number) => boolean, measured: string, confirmed: boolean) => ({
    id,
    statement,
    measured,
    confirmed,
    runsConfirmed: `${values.filter(ok).length}/${values.length}`,
    values,
  });
  const targets = [
    target('T1', 'On mixed terrain, the new System One alone reaches ≥ 90% of the planner', t1, (v) => v >= 0.9, `${(100 * mean(t1)).toFixed(1)}%`, mean(t1) >= 0.9),
    target('T2', 'On flat ground, the new System One alone keeps ≥ 95% of the old one', t2, (v) => v >= 0.95, `${(100 * mean(t2)).toFixed(1)}%`, mean(t2) >= 0.95),
    target('T3', 'On mixed terrain, the new hybrid + guard @ 0.9 escalates less than the old one', t3, (v) => v > 0, `${(100 * mean(per((r) => h(r, 'old', '0.9').escalation))).toFixed(1)}% → ${(100 * mean(per((r) => h(r, 'new', '0.9').escalation))).toFixed(1)}%`, mean(t3) > 0),
    target(
      'T4',
      'On mixed terrain, the new hybrid + guard @ 0.7 reaches ≥ 95% of the planner at a lower cost than the old one',
      t4ok,
      (v) => v === 1,
      `${((100 * meanNew07) / planner.mixed.distance).toFixed(1)}% of the planner at ${mean(per((r) => h(r, 'new', '0.7').costPerMove)).toFixed(0)} vs ${mean(per((r) => h(r, 'old', '0.7').costPerMove)).toFixed(0)} units per move`,
      meanNew07 >= 0.95 * planner.mixed.distance && mean(per((r) => h(r, 'new', '0.7').costPerMove)) < mean(per((r) => h(r, 'old', '0.7').costPerMove)),
    ),
  ];
  const conditions = Object.fromEntries(
    TERRAINS.flatMap((t) =>
      NET_CONDITIONS.flatMap((c) =>
        (['old', 'new'] as const).map((net) => {
          const rows = results.map((r) => r[net][`${t}|${c}`]);
          return [`${net}|${t}|${c}`, { distance: tInterval(rows.map((x) => x.distance)), falls: rows.map((x) => x.falls), costPerMove: tInterval(rows.map((x) => x.costPerMove)), escalation: tInterval(rows.map((x) => x.escalation)), agreement: rows.map((x) => x.agreement) }];
        }),
      ),
    ),
  );
  const out = {
    createdAt: new Date().toISOString(),
    split,
    seeds: { count: seeds.length, first: seeds[0], last: seeds.at(-1) },
    smoke: SMOKE,
    hardware: { cpu: cpus()[0]?.model, cores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), node: process.version },
    pipeline: pipelineConfig(1),
    planner,
    conditions,
    targets,
    seconds: Math.round((performance.now() - t0) / 1000),
  };
  writeFileSync(join(ROOT, `study-terrain-${split}-${seeds.length}.json`), JSON.stringify(out, null, 2));
  for (const t of targets) console.log(`${t.id} ${t.confirmed ? 'CONFIRMED    ' : 'NOT CONFIRMED'} ${t.measured} (${t.runsConfirmed} runs) — ${t.statement}`);
  console.log(`Study → ${join(ROOT, `study-terrain-${split}-${seeds.length}.json`)}`);
}

main().catch(async (err) => {
  console.error(err);
  await pool.close();
  process.exit(1);
});
