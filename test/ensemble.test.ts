import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Ensemble, Mlp, exportEnsemble, importEnsemble } from '../src/nn';

const config = { inputSize: 6, hidden: [16, 16] as [number, number], low: [-0.3, -1], high: [0.3, 1], members: 5, seed: 3 };

/** Smooth synthetic mapping state → action inside the bounds. */
function dataset(n: number, seed: number) {
  const rng = Rng.stream(seed, 'ens-data');
  const xs: Float32Array[] = [];
  const ys: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = Float32Array.from({ length: 6 }, () => rng.normal() * 0.7);
    xs.push(x);
    ys.push([0.3 * Math.tanh(x[0] - 0.5 * x[1]), Math.tanh(x[2] + x[3] * x[4])]);
  }
  return { xs, ys };
}

describe('MSE gradient', () => {
  it('matches finite differences in float64', () => {
    const net = new Mlp({ inputSize: 5, hidden: [4, 3], outputSize: 2, seed: 2 }, 'f64');
    const x = [0.3, -1.2, 0.5, 0, 2];
    const y = [0.4, -0.7];
    const grad = new Float64Array(net.numParams);
    net.accumulateMse(x, y, grad, 1);
    const eps = 1e-6;
    let maxRel = 0;
    for (let k = 0; k < net.numParams; k++) {
      const orig = net.params[k];
      const g = new Float64Array(net.numParams);
      net.params[k] = orig + eps;
      const lp = net.accumulateMse(x, y, g, 1);
      net.params[k] = orig - eps;
      const lm = net.accumulateMse(x, y, g, 1);
      net.params[k] = orig;
      const numeric = (lp - lm) / (2 * eps);
      maxRel = Math.max(maxRel, Math.abs(numeric - grad[k]) / Math.max(Math.abs(numeric) + Math.abs(grad[k]), 1e-7));
    }
    expect(maxRel).toBeLessThan(1e-4);
  });
});

describe('Ensemble', () => {
  it('has distinct members and returns the clamped mean action with cost K', () => {
    const e = new Ensemble(config);
    expect(e.members[0].params[0]).not.toBe(e.members[1].params[0]);
    const x = Float32Array.from([0.1, 0.2, -0.3, 0.4, 0.5, -0.6]);
    const d = e.decide(x);
    const outs = e.outputs(x);
    const meanSteer = Math.max(-1, Math.min(1, outs.reduce((a, o) => a + o[0], 0) / 5));
    expect(d.action[0]).toBeCloseTo(-0.3 + ((meanSteer + 1) / 2) * 0.6, 10);
    expect(d.cost).toBe(5);
    expect(d.disagreement).toBeGreaterThan(0);
  });

  it('training reduces the error of the mean', () => {
    const { xs, ys } = dataset(800, 1);
    const e = new Ensemble(config);
    const before = e.meanSquaredError(xs, ys);
    e.train(xs, ys, 15, 32);
    expect(e.meanSquaredError(xs, ys)).toBeLessThan(before * 0.5);
  });

  it('unanimous members have zero disagreement and maximum confidence', () => {
    const e = new Ensemble(config);
    for (const m of e.members) m.params.set(e.members[0].params);
    const d = e.decide(Float32Array.from([1, 0, 0, 1, 0, 1]));
    expect(d.disagreement).toBeCloseTo(0, 12);
    expect(d.confidence).toBe(Math.max(...e.confidenceMap.values));
  });

  it('fits a non-increasing confidence map', () => {
    const { xs, ys } = dataset(600, 2);
    const e = new Ensemble(config);
    e.train(xs, ys, 5, 32);
    const map = e.fitConfidence(xs, ys, (p, t) => Math.abs(p[0] - t[0]) < 0.03 && Math.sign(p[1] || 1) === Math.sign(t[1] || 1));
    for (let i = 1; i < map.values.length; i++) expect(map.values[i]).toBeLessThanOrEqual(map.values[i - 1]);
    for (let i = 1; i < map.edges.length; i++) expect(map.edges[i]).toBeGreaterThanOrEqual(map.edges[i - 1]);
  });

  it('round-trips through export and import', () => {
    const { xs, ys } = dataset(300, 3);
    const e = new Ensemble(config);
    e.train(xs, ys, 2, 32);
    e.fitConfidence(xs, ys, (p, t) => Math.abs(p[0] - t[0]) < 0.03);
    const back = importEnsemble(JSON.parse(JSON.stringify(exportEnsemble(e))));
    for (const x of xs.slice(0, 30)) {
      const a = e.decide(x);
      const b = back.decide(x);
      for (let d = 0; d < 2; d++) expect(Math.abs(a.action[d] - b.action[d])).toBeLessThan(1e-6);
      expect(Math.abs(a.confidence - b.confidence)).toBeLessThan(1e-6);
    }
  });
});
