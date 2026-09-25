import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Ensemble, exportEnsemble, importEnsemble, Mlp, ModularNet } from '../src/nn';

const CONFIG = { inputSize: 9, split: 5, encoderHidden: [4, 3] as [number, number], proprioLatent: 3, scanLatent: 2, hidden: [5, 4] as [number, number], outputSize: 2, seed: 4 };

function samples(n: number, seed: number): Array<{ x: Float64Array; y: Float64Array }> {
  const rng = Rng.stream(seed, 'modular-test');
  return Array.from({ length: n }, () => ({
    x: Float64Array.from({ length: CONFIG.inputSize }, () => rng.normal()),
    y: Float64Array.from({ length: CONFIG.outputSize }, () => rng.normal()),
  }));
}

describe('modular network', () => {
  it('analytic gradients through the three modules match finite differences (float64)', () => {
    const net = new ModularNet(CONFIG, 'f64');
    // Biases start at zero: a sample whose units are all off lands exactly on a ReLU kink, where finite
    // differences are meaningless. A small perturbation of every parameter moves every sample off the kinks.
    const jitter = Rng.stream(9, 'modular-jitter');
    for (let k = 0; k < net.numParams; k++) net.params[k] += 0.05 * jitter.normal();
    const data = samples(5, 1);
    const lossOf = () => data.reduce((l, s) => l + net.accumulateMse(s.x, s.y, new Float64Array(net.numParams), 0) / data.length, 0);
    const grad = new Float64Array(net.numParams);
    for (const s of data) net.accumulateMse(s.x, s.y, grad, 1 / data.length);
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
      maxRel = Math.max(maxRel, Math.abs(numeric - grad[k]) / Math.max(Math.abs(numeric) + Math.abs(grad[k]), 1e-7));
    }
    expect(maxRel).toBeLessThan(1e-4);
  });

  it('is the composition of its three MLPs, sharing one parameter buffer', () => {
    const net = new ModularNet(CONFIG);
    const x = samples(1, 2)[0].x;
    const out = Array.from(net.logits(x));
    const latent = [...Array.from(net.proprio.logits(x.slice(0, 5))), ...Array.from(net.scan.logits(x.slice(5)))];
    expect(out).toEqual(Array.from(net.motor.logits(latent)));
    expect(net.numParams).toBe(net.proprio.numParams + net.scan.numParams + net.motor.numParams);
    net.params[net.offsets.motor] += 1; // a view: changing the flat buffer changes the module
    expect(net.motor.params[0]).toBe(net.params[net.offsets.motor]);
  });

  it('has the parameter count declared for the height-scan spike', () => {
    const modular = new ModularNet({ inputSize: 123, split: 46, encoderHidden: [64, 64], proprioLatent: 32, scanLatent: 16, hidden: [256, 256], outputSize: 4, seed: 1 });
    expect(modular.numParams).toBe(98_804);
    expect(new Mlp({ inputSize: 123, hidden: [256, 256], outputSize: 4, seed: 1 }).numParams).toBe(98_564);
  });

  it('trains in an ensemble, and survives export and import unchanged', () => {
    const e = new Ensemble({ inputSize: 9, hidden: [8, 8], low: [-1, -1], high: [1, 1], members: 3, seed: 2, modular: { split: 5, encoderHidden: [6, 6], proprioLatent: 4, scanLatent: 3 } });
    expect(e.members[0]).toBeInstanceOf(ModularNet);
    const data = samples(200, 3);
    const xs = data.map((d) => Float32Array.from(d.x));
    // A target that needs both parts of the input: tanh of a mix of proprioceptive and scan values.
    const ys = data.map((d) => [Math.tanh(d.x[0] + d.x[6]), Math.tanh(d.x[2] - d.x[8])]);
    const before = e.meanSquaredError(xs, ys);
    e.train(xs, ys, 120);
    const after = e.meanSquaredError(xs, ys);
    // Measured: 0.71 → 0.20 (a single-MLP ensemble of similar size: 1.05 → 0.14).
    expect(after).toBeLessThan(before * 0.4);
    const copy = importEnsemble(exportEnsemble(e));
    expect(copy.members[0]).toBeInstanceOf(ModularNet);
    expect(Array.from(copy.decide(xs[0]).action)).toEqual(Array.from(e.decide(xs[0]).action));
  });
});
