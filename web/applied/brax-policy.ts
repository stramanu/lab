/**
 * Deterministic inference of a brax PPO policy exported from MuJoCo Playground (applied side): the
 * observation under `obsKey` is normalized with the running statistics, ((x − mean) / std), passed through
 * a dense MLP with swish activations and a linear last layer, and the action is tanh of the first half of
 * its outputs (the mode of brax's normal-tanh distribution).
 */

interface Dense {
  kernel: number[][]; // [input][output], as in flax
  bias: number[];
}

export interface BraxPolicyExport {
  normalizer: { mean: Record<string, number[]>; std: Record<string, number[]> };
  policy: { params: Record<string, Dense> };
}

const swish = (x: number) => x / (1 + Math.exp(-x));

export class BraxPolicy {
  readonly inputSize: number;
  readonly actionSize: number;
  private readonly mean: Float64Array;
  private readonly std: Float64Array;
  private readonly layers: Array<{ w: Float64Array; b: Float64Array; n: number; m: number }>;
  private readonly buffers: Float64Array[];

  constructor(exp: BraxPolicyExport, obsKey = 'state') {
    this.mean = Float64Array.from(exp.normalizer.mean[obsKey]);
    this.std = Float64Array.from(exp.normalizer.std[obsKey]);
    const names = Object.keys(exp.policy.params).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
    this.layers = names.map((name) => {
      const { kernel, bias } = exp.policy.params[name];
      const m = kernel.length;
      const n = bias.length;
      // Row-major by output unit: w[j * m + i] = kernel[i][j].
      const w = new Float64Array(n * m);
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) w[j * m + i] = kernel[i][j];
      return { w, b: Float64Array.from(bias), n, m };
    });
    this.inputSize = this.layers[0].m;
    this.actionSize = this.layers[this.layers.length - 1].n / 2;
    if (this.mean.length !== this.inputSize) throw new Error(`Normalizer has ${this.mean.length} values for ${this.inputSize} inputs`);
    this.buffers = [new Float64Array(this.inputSize), ...this.layers.map((l) => new Float64Array(l.n))];
  }

  /** Deterministic action in [−1, 1] for one observation (a fresh array). */
  act(obs: ArrayLike<number>): Float64Array {
    const x = this.buffers[0];
    for (let i = 0; i < this.inputSize; i++) x[i] = (obs[i] - this.mean[i]) / this.std[i];
    this.layers.forEach((layer, l) => {
      const input = this.buffers[l];
      const out = this.buffers[l + 1];
      const last = l === this.layers.length - 1;
      for (let j = 0; j < layer.n; j++) {
        let s = layer.b[j];
        const row = j * layer.m;
        for (let i = 0; i < layer.m; i++) s += layer.w[row + i] * input[i];
        out[j] = last ? s : swish(s);
      }
    });
    const logits = this.buffers[this.buffers.length - 1];
    return Float64Array.from({ length: this.actionSize }, (_, k) => Math.tanh(logits[k]));
  }
}
