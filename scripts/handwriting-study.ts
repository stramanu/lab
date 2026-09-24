/**
 * Final handwriting study on the TEST writers: 5 MLP training runs (run seeds 1–5) and $P once,
 * with the targets R1–R3 fixed in the proposal. Writes artifacts/handwriting/study/study-test.json
 * and run 1's weights (published by `pnpm demo:data`).
 * Usage: pnpm hw:study
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tInterval } from '../src/eval/aggregate';
import {
  DEFAULT_HANDWRITING_TRAIN,
  LETTERS,
  MlpRecognizer,
  PDollarRecognizer,
  selectSplit,
  type HandwritingEncoding,
  type Recognition,
  type Sample,
} from '../src/handwriting';
import { reliability } from '../src/nn';
import { loadSamples } from './handwriting-lib';
import { hardware } from './lib';

/** Chosen on dev writers by `pnpm exp handwriting-encoding` (EXPERIMENTS.md, decision 22). */
const ENCODING: HandwritingEncoding = 'raster';
const RUNS = [1, 2, 3, 4, 5];
const OUT = 'artifacts/handwriting/study';
const TARGETS = { r1Top1: 0.9, r2Margin: 0.03, r2CostRatio: 100, r3Ece: 0.05 };

interface Scored {
  top1: number;
  top3: number;
  confusion: number[][];
  cost: number;
}

function score(test: Sample[], recognize: (s: Sample) => Recognition): Scored {
  const confusion = LETTERS.split('').map(() => new Array<number>(LETTERS.length).fill(0));
  let top1 = 0;
  let top3 = 0;
  let cost = 0;
  for (const s of test) {
    const r = recognize(s);
    confusion[s.label][r.top[0].label]++;
    if (r.top[0].label === s.label) top1++;
    if (r.top.slice(0, 3).some((c) => c.label === s.label)) top3++;
    cost += r.cost;
  }
  return { top1: top1 / test.length, top3: top3 / test.length, confusion, cost: cost / test.length };
}

function topConfusions(confusion: number[][], total: number, k = 10) {
  const pairs: Array<{ truth: string; predicted: string; count: number; share: number }> = [];
  confusion.forEach((row, t) =>
    row.forEach((count, p) => {
      if (t !== p && count > 0) pairs.push({ truth: LETTERS[t], predicted: LETTERS[p], count, share: count / total });
    }),
  );
  return pairs.sort((a, b) => b.count - a.count || a.truth.localeCompare(b.truth)).slice(0, k);
}

const pct = (v: number) => `${(100 * v).toFixed(1)}%`;

console.log('Study on the TEST writers: use it only for final, published numbers.\n');
const samples = loadSamples();
const train = selectSplit(samples, ['train']);
const dev = selectSplit(samples, ['dev']);
const test = selectSplit(samples, ['test'], { allowTest: true });

const runs = RUNS.map((seed) => {
  const t0 = performance.now();
  const model = MlpRecognizer.train(train, { encoding: ENCODING, seed, ...DEFAULT_HANDWRITING_TRAIN });
  const trainingSeconds = (performance.now() - t0) / 1000;
  const eceAt = (temperature: number) => {
    const conf: number[] = [];
    const correct: boolean[] = [];
    const saved = model.temperature;
    model.temperature = temperature;
    for (const s of test) {
      const top = model.recognize(s.strokes, 1).top[0];
      conf.push(top.score);
      correct.push(top.label === s.label);
    }
    model.temperature = saved;
    return reliability(conf, correct, 15).ece;
  };
  const eceBefore = eceAt(1);
  const temperature = model.calibrate(dev);
  const eceAfter = eceAt(temperature);
  const t1 = performance.now();
  const scored = score(test, (s) => model.recognize(s.strokes, 3));
  const msPerRecognition = (performance.now() - t1) / test.length;
  if (seed === 1) {
    mkdirSync(`${OUT}/run-1`, { recursive: true });
    writeFileSync(`${OUT}/run-1/weights.json`, JSON.stringify(model.export({ game: 'handwriting', run: 1, params: model.net.numParams })));
  }
  console.log(`run ${seed}: top-1 ${pct(scored.top1)}, top-3 ${pct(scored.top3)}, ECE ${eceBefore.toFixed(3)} → ${eceAfter.toFixed(3)} (T = ${temperature.toFixed(2)}), ${trainingSeconds.toFixed(0)} s`);
  return { seed, ...scored, eceBefore, eceAfter, temperature, trainingSeconds, msPerRecognition, params: model.net.numParams };
});

const pd = PDollarRecognizer.fromSamples(train);
const t0 = performance.now();
const pdollar = score(test, (s) => pd.recognize(s.strokes, 3));
const pdMs = (performance.now() - t0) / test.length;
console.log(`$P: top-1 ${pct(pdollar.top1)}, top-3 ${pct(pdollar.top3)}, ${pdollar.cost.toLocaleString('en')} operations, ${pdMs.toFixed(0)} ms per recognition`);

const mlpConfusion = runs[0].confusion.map((row, t) => row.map((_, p) => runs.reduce((sum, r) => sum + r.confusion[t][p], 0)));
const agg = {
  top1: tInterval(runs.map((r) => r.top1)),
  top3: tInterval(runs.map((r) => r.top3)),
  eceBefore: tInterval(runs.map((r) => r.eceBefore)),
  eceAfter: tInterval(runs.map((r) => r.eceAfter)),
  cost: runs[0].cost,
  /** Wall-clock, including preprocessing and encoding; not a controlled benchmark. */
  msPerRecognition: tInterval(runs.map((r) => r.msPerRecognition)),
};
const costRatio = pdollar.cost / agg.cost;
const r2 = (top1: number) => top1 >= pdollar.top1 - TARGETS.r2Margin && costRatio >= TARGETS.r2CostRatio;
const targets = [
  {
    id: 'R1',
    statement: 'MLP top-1 accuracy on test writers',
    target: `≥ ${pct(TARGETS.r1Top1)}`,
    measured: pct(agg.top1.mean),
    confirmed: agg.top1.mean >= TARGETS.r1Top1,
    runsConfirmed: `${runs.filter((r) => r.top1 >= TARGETS.r1Top1).length}/${runs.length}`,
  },
  {
    id: 'R2',
    statement: "MLP top-1 at least $P's minus 3 points, at ≥ 100× lower cost",
    target: `≥ ${pct(pdollar.top1 - TARGETS.r2Margin)} and cost ratio ≥ ${TARGETS.r2CostRatio}×`,
    measured: `${pct(agg.top1.mean)} vs $P ${pct(pdollar.top1)}, cost ratio ${costRatio.toFixed(0)}×`,
    confirmed: r2(agg.top1.mean),
    runsConfirmed: `${runs.filter((r) => r2(r.top1)).length}/${runs.length}`,
  },
  {
    id: 'R3',
    statement: 'MLP ECE after temperature scaling (15 bins)',
    target: `≤ ${TARGETS.r3Ece}`,
    measured: agg.eceAfter.mean.toFixed(3),
    confirmed: agg.eceAfter.mean <= TARGETS.r3Ece,
    runsConfirmed: `${runs.filter((r) => r.eceAfter <= TARGETS.r3Ece).length}/${runs.length}`,
  },
];

mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/study-test.json`,
  JSON.stringify(
    {
      game: 'handwriting',
      createdAt: new Date().toISOString(),
      split: 'test',
      data: { source: 'UJI Pen Characters v2 (uppercase)', trainWriters: 30, devWriters: 10, testWriters: 20, testSamples: test.length },
      model: { encoding: ENCODING, ...DEFAULT_HANDWRITING_TRAIN, params: runs[0].params },
      hardware: hardware(),
      runs: runs.map(({ confusion: _c, params: _p, ...r }) => r),
      mlp: { ...agg, topConfusions: topConfusions(mlpConfusion, runs.length * test.length) },
      pdollar: {
        top1: pdollar.top1,
        top3: pdollar.top3,
        cost: pdollar.cost,
        msPerRecognition: pdMs,
        templates: train.length,
        topConfusions: topConfusions(pdollar.confusion, test.length),
      },
      costRatio,
      targets,
    },
    null,
    2,
  ),
);
console.log(`\nMLP: top-1 ${pct(agg.top1.mean)} ± ${pct(agg.top1.ci95)}, top-3 ${pct(agg.top3.mean)}, ECE ${agg.eceBefore.mean.toFixed(3)} → ${agg.eceAfter.mean.toFixed(3)}, ${agg.cost.toLocaleString('en')} operations, ${agg.msPerRecognition.mean.toFixed(3)} ms per recognition (${costRatio.toFixed(0)}× cheaper than $P)`);
for (const t of targets) console.log(`${t.id} ${t.confirmed ? 'CONFIRMED    ' : 'NOT CONFIRMED'} ${t.measured} (target: ${t.target}; holds in ${t.runsConfirmed} runs)`);
console.log(`\nStudy → ${OUT}/study-test.json`);
