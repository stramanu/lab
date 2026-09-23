import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { SNAKE_ENCODING_SIZE } from '../src/games/snake';
import {
  ArrayTrainData,
  Mlp,
  Trainer,
  evaluate,
  exportPolicy,
  fitTemperature,
  importPolicy,
  reliability,
  softLabels,
  type MlpConfig,
} from '../src/nn';

const SNAKE_NET: MlpConfig = { inputSize: SNAKE_ENCODING_SIZE, hidden: [64, 64], outputSize: 3, seed: 1 };

/** Synthetic dataset: labels are soft-maxed scores of a fixed random linear teacher. */
function syntheticData(n: number, inputSize: number, actions: number, seed: number, maskSome = false): ArrayTrainData {
  const rng = Rng.stream(seed, 'synthetic');
  const teacher = Array.from({ length: actions * inputSize }, () => rng.normal());
  const xs: Float32Array[] = [];
  const ys: Float32Array[] = [];
  const ms: Uint8Array[] = [];
  for (let s = 0; s < n; s++) {
    const x = Float32Array.from({ length: inputSize }, () => (rng.next() < 0.5 ? 0 : rng.normal()));
    const mask = Uint8Array.from({ length: actions }, (_, a) => (maskSome && a === s % actions ? 0 : 1));
    const scores = Array.from({ length: actions }, (_, a) => {
      let v = 0;
      for (let i = 0; i < inputSize; i++) v += teacher[a * inputSize + i] * x[i];
      return mask[a] ? v : -Infinity;
    });
    xs.push(x);
    ys.push(softLabels(scores, mask, 0.5));
    ms.push(mask);
  }
  return new ArrayTrainData(xs, ys, ms);
}

describe('Mlp', () => {
  it('has 17,283 parameters for the default Snake network', () => {
    const net = new Mlp(SNAKE_NET);
    expect(net.numParams).toBe(17_283);
    expect(net.numParams).toBeGreaterThanOrEqual(5_000);
    expect(net.numParams).toBeLessThanOrEqual(40_000);
  });

  it('initialization is deterministic given the seed', () => {
    expect(Array.from(new Mlp(SNAKE_NET).params)).toEqual(Array.from(new Mlp(SNAKE_NET).params));
    expect(new Mlp({ ...SNAKE_NET, seed: 2 }).params[0]).not.toBe(new Mlp(SNAKE_NET).params[0]);
  });

  it('gives illegal actions probability exactly 0 and sums to 1', () => {
    const net = new Mlp(SNAKE_NET);
    const x = Float32Array.from({ length: SNAKE_ENCODING_SIZE }, (_, i) => (i % 5 === 0 ? 1 : 0));
    const p = net.probs(x, [true, false, true]);
    expect(p[1]).toBe(0);
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 6);
  });

  it('analytic gradients match finite differences (float64)', () => {
    const net = new Mlp({ inputSize: 6, hidden: [5, 4], outputSize: 3, seed: 3 }, 'f64');
    const data = syntheticData(4, 6, 3, 4, true);
    const lossOf = () => {
      let l = 0;
      const g = new Float64Array(net.numParams);
      for (let i = 0; i < data.size; i++) l += net.accumulateGradient(data.x(i), data.y(i), data.legal(i), g, 1 / data.size) / data.size;
      return l;
    };
    const grad = new Float64Array(net.numParams);
    for (let i = 0; i < data.size; i++) net.accumulateGradient(data.x(i), data.y(i), data.legal(i), grad, 1 / data.size);
    const eps = 1e-6;
    let maxRel = 0;
    for (let k = 0; k < net.numParams; k++) {
      const orig = net.params[k];
      net.params[k] = orig + eps;
      const lp = lossOf();
      net.params[k] = orig - eps;
      const lm = lossOf();
      net.params[k] = orig;
      const numeric = (lp - lm) / (2 * eps);
      const rel = Math.abs(numeric - grad[k]) / Math.max(Math.abs(numeric) + Math.abs(grad[k]), 1e-7);
      maxRel = Math.max(maxRel, rel);
    }
    expect(maxRel).toBeLessThan(1e-4);
  });

  it('training loss decreases on a fixed dataset', () => {
    const data = syntheticData(1000, 20, 3, 5);
    const net = new Mlp({ inputSize: 20, hidden: [32, 32], outputSize: 3, seed: 6 });
    const before = evaluate(net, data);
    const trainer = new Trainer(net, { lr: 3e-3 }, 7);
    trainer.train(data, { epochs: 10, batchSize: 32 });
    const after = evaluate(net, data);
    expect(after.loss).toBeLessThan(before.loss);
    expect(after.agreement).toBeGreaterThan(before.agreement);
  });

  it('training is deterministic', () => {
    const data = syntheticData(200, 10, 3, 8);
    const run = () => {
      const net = new Mlp({ inputSize: 10, hidden: [8, 8], outputSize: 3, seed: 9 });
      new Trainer(net, {}, 10).train(data, { epochs: 3, batchSize: 16 });
      return Array.from(net.params);
    };
    expect(run()).toEqual(run());
  });
});

describe('calibration', () => {
  it('ECE on hand-built cases', () => {
    expect(reliability([0.9, 0.9, 0.9, 0.9], [true, true, true, false]).ece).toBeCloseTo(0.15, 10);
    expect(reliability([0.95, 0.95, 0.55, 0.55], [true, true, true, false]).ece).toBeCloseTo(0.5 * 0.05 + 0.5 * 0.05, 10);
    const r = reliability([0.05, 0.95], [false, true], 10);
    expect(r.bins).toHaveLength(10);
    expect(r.bins[9].count).toBe(1);
    expect(r.bins[0].accuracy).toBe(0);
  });

  it('fitted temperature does not worsen validation NLL', () => {
    const train = syntheticData(300, 12, 3, 11);
    const val = syntheticData(300, 12, 3, 12);
    const net = new Mlp({ inputSize: 12, hidden: [32, 32], outputSize: 3, seed: 13 });
    new Trainer(net, { lr: 1e-2 }, 14).train(train, { epochs: 40, batchSize: 16 }); // overfit on purpose
    const fit = fitTemperature(net, val);
    expect(fit.nll).toBeLessThanOrEqual(fit.nllAtOne);
    expect(fit.temperature).toBeGreaterThan(0);
    expect(evaluate(net, val, fit.temperature).loss).toBeCloseTo(fit.nll, 5);
  });
});

describe('serialization', () => {
  it('round-trips weights, config and temperature', () => {
    const net = new Mlp(SNAKE_NET);
    new Trainer(net, {}, 1).train(syntheticData(100, SNAKE_ENCODING_SIZE, 3, 15), { epochs: 1 });
    const json = JSON.parse(JSON.stringify(exportPolicy(net, 1.7, { game: 'snake' })));
    const { net: loaded, calibrationT, meta } = importPolicy(json);
    expect(calibrationT).toBe(1.7);
    expect(meta).toEqual({ game: 'snake' });
    const rng = Rng.stream(1, 'rt');
    for (let s = 0; s < 50; s++) {
      const x = Float32Array.from({ length: SNAKE_ENCODING_SIZE }, () => (rng.next() < 0.25 ? 1 : 0));
      const a = net.probs(x, null, 1.7);
      const b = loaded.probs(x, null, 1.7);
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-6);
    }
    expect(json.weights.length).toBeLessThan(100_000);
  });
});

describe('activation trace', () => {
  it('matches the policy and exposes ReLU hidden activations', () => {
    const net = new Mlp({ inputSize: 12, hidden: [8, 6], outputSize: 3, seed: 4 });
    const rng = Rng.stream(2, 'trace');
    for (let s = 0; s < 20; s++) {
      const x = Float32Array.from({ length: 12 }, () => rng.normal());
      const t = net.trace(x);
      const p = net.probs(x, null, 1);
      const max = Math.max(...t.logits);
      const e = Array.from(t.logits, (z) => Math.exp(z - max));
      const sum = e.reduce((a, b) => a + b, 0);
      e.forEach((v, k) => expect(Math.abs(v / sum - p[k])).toBeLessThan(1e-6));
      expect(t.h1.length).toBe(8);
      expect(t.h2.length).toBe(6);
      expect(Array.from(t.h1).every((v) => v >= 0)).toBe(true);
      expect(Array.from(t.input)).toEqual(Array.from(x));
    }
  });
});
