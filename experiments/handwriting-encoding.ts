/**
 * Chooses the handwriting encoding on dev writers only: trains the MLP with each encoding
 * (3 run seeds, the study's configuration) and compares dev top-1 accuracy. $P is reported on dev for context.
 */
import { selectSplit, labelledData, MlpRecognizer, PDollarRecognizer, type HandwritingEncoding } from '../src/handwriting';
import { evaluate, networkReliability } from '../src/nn';
import { mean } from '../src/core/stats';
import { loadSamples } from '../scripts/handwriting-lib';
import { DEFAULT_HANDWRITING_TRAIN } from '../src/handwriting';
import type { ExperimentResult } from './common';

const SEEDS = [101, 102, 103];

export function run(): ExperimentResult {
  const samples = loadSamples();
  const train = selectSplit(samples, ['train']);
  const dev = selectSplit(samples, ['dev']);
  const results: Record<string, unknown> = {};
  for (const encoding of ['trajectory', 'raster'] as HandwritingEncoding[]) {
    const runs = SEEDS.map((seed) => {
      const model = MlpRecognizer.train(train, { encoding, seed, ...DEFAULT_HANDWRITING_TRAIN });
      const data = labelledData(dev, encoding);
      return {
        seed,
        devTop1: evaluate(model.net, data).agreement,
        devEceAtT1: networkReliability(model.net, data, 1, 15).ece,
        cost: model.cost,
      };
    });
    results[encoding] = { runs, meanDevTop1: mean(runs.map((r) => r.devTop1)), meanDevEceAtT1: mean(runs.map((r) => r.devEceAtT1)) };
    console.log(encoding, JSON.stringify(results[encoding]));
  }
  const pd = PDollarRecognizer.fromSamples(train);
  let hits = 0;
  let cost = 0;
  const t0 = performance.now();
  for (const s of dev) {
    const r = pd.recognize(s.strokes, 1);
    if (r.top[0].label === s.label) hits++;
    cost += r.cost;
  }
  results.pdollar = { devTop1: hits / dev.length, costPerRecognition: cost / dev.length, msPerRecognition: (performance.now() - t0) / dev.length };
  const [t, r] = [(results.trajectory as { meanDevTop1: number }).meanDevTop1, (results.raster as { meanDevTop1: number }).meanDevTop1];
  results.chosen = t >= r ? 'trajectory' : 'raster';
  return {
    claim: 'The encoding used by the handwriting study is the one with the higher mean dev top-1 accuracy.',
    split: 'dev',
    seeds: [],
    config: { trainWriters: 30, devWriters: 10, runSeeds: SEEDS, ...DEFAULT_HANDWRITING_TRAIN },
    results,
  };
}
