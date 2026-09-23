import type { ParamBuffer } from './mlp';

export interface AdamConfig {
  lr: number;
  beta1: number;
  beta2: number;
  eps: number;
}

export const DEFAULT_ADAM: AdamConfig = { lr: 1e-3, beta1: 0.9, beta2: 0.999, eps: 1e-8 };

export class Adam {
  readonly config: AdamConfig;
  private m: Float64Array;
  private v: Float64Array;
  private t = 0;

  constructor(size: number, config: Partial<AdamConfig> = {}) {
    this.config = { ...DEFAULT_ADAM, ...config };
    this.m = new Float64Array(size);
    this.v = new Float64Array(size);
  }

  step(params: ParamBuffer, grad: Float64Array): void {
    const { lr, beta1, beta2, eps } = this.config;
    this.t++;
    const c1 = 1 - beta1 ** this.t;
    const c2 = 1 - beta2 ** this.t;
    for (let i = 0; i < params.length; i++) {
      const g = grad[i];
      this.m[i] = beta1 * this.m[i] + (1 - beta1) * g;
      this.v[i] = beta2 * this.v[i] + (1 - beta2) * g * g;
      params[i] -= (lr * (this.m[i] / c1)) / (Math.sqrt(this.v[i] / c2) + eps);
    }
  }
}
