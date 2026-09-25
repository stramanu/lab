import { Mlp, type ParamBuffer, type Precision } from './mlp';

/**
 * Architecture of a modular regressor: the input is split into a proprioceptive part (the first `split`
 * values) and an exteroceptive part (the rest, e.g. a height scan). Each part has its own encoder, and a
 * motor network maps the two latents to the outputs, as in perceptive locomotion (Miki et al. 2022).
 */
export interface ModularArchitecture {
  /** Number of proprioceptive inputs; the remaining inputs go to the scan encoder. */
  split: number;
  /** Hidden layers of both encoders. */
  encoderHidden: [number, number];
  /** Latent sizes (linear encoder outputs). */
  proprioLatent: number;
  scanLatent: number;
}

export interface ModularConfig extends ModularArchitecture {
  inputSize: number;
  /** Hidden layers of the motor network. */
  hidden: [number, number];
  outputSize: number;
  seed: number;
}

/**
 * Three MLPs joined and trained end to end: a proprioceptive encoder, a scan encoder and a motor network
 * on their concatenated latents. All parameters live in one flat buffer [proprio, scan, motor], so the
 * model trains, serializes and runs like a single Mlp.
 */
export class ModularNet {
  readonly config: ModularConfig;
  readonly params: ParamBuffer;
  readonly numParams: number;
  readonly proprio: Mlp;
  readonly scan: Mlp;
  readonly motor: Mlp;
  /** Offsets of each module inside `params`. */
  readonly offsets: { proprio: number; scan: number; motor: number };
  private readonly xp: Float64Array;
  private readonly xs: Float64Array;
  private readonly latent: Float64Array;
  private readonly dOut: Float64Array;
  private readonly dLatent: Float64Array;

  constructor(config: ModularConfig, precision: Precision = 'f32') {
    this.config = config;
    const { split, inputSize, encoderHidden, proprioLatent, scanLatent, hidden, outputSize, seed } = config;
    if (split <= 0 || split >= inputSize) throw new Error(`Invalid split ${split} of ${inputSize} inputs`);
    const pCfg = { inputSize: split, hidden: encoderHidden, outputSize: proprioLatent, seed: seed * 7 + 1 };
    const sCfg = { inputSize: inputSize - split, hidden: encoderHidden, outputSize: scanLatent, seed: seed * 7 + 2 };
    const mCfg = { inputSize: proprioLatent + scanLatent, hidden, outputSize, seed: seed * 7 + 3 };
    const size = (c: { inputSize: number; hidden: [number, number]; outputSize: number }) =>
      c.inputSize * c.hidden[0] + c.hidden[0] + c.hidden[0] * c.hidden[1] + c.hidden[1] + c.hidden[1] * c.outputSize + c.outputSize;
    const sizes = [size(pCfg), size(sCfg), size(mCfg)];
    this.numParams = sizes[0] + sizes[1] + sizes[2];
    this.params = precision === 'f32' ? new Float32Array(this.numParams) : new Float64Array(this.numParams);
    this.offsets = { proprio: 0, scan: sizes[0], motor: sizes[0] + sizes[1] };
    this.proprio = new Mlp(pCfg, precision, this.params.subarray(0, sizes[0]));
    this.scan = new Mlp(sCfg, precision, this.params.subarray(sizes[0], sizes[0] + sizes[1]));
    this.motor = new Mlp(mCfg, precision, this.params.subarray(sizes[0] + sizes[1]));
    this.xp = new Float64Array(split);
    this.xs = new Float64Array(inputSize - split);
    this.latent = new Float64Array(proprioLatent + scanLatent);
    this.dOut = new Float64Array(outputSize);
    this.dLatent = new Float64Array(proprioLatent + scanLatent);
  }

  /** Forward pass; returns the motor network's output buffer (valid until the next call). */
  logits(x: ArrayLike<number>): Float64Array {
    const { split, proprioLatent } = this.config;
    for (let i = 0; i < this.xp.length; i++) this.xp[i] = x[i];
    for (let i = 0; i < this.xs.length; i++) this.xs[i] = x[split + i];
    this.latent.set(this.proprio.logits(this.xp), 0);
    this.latent.set(this.scan.logits(this.xs), proprioLatent);
    return this.motor.logits(this.latent);
  }

  /** Latents of the last forward pass (proprioceptive, then scan). */
  lastLatent(): Float64Array {
    return Float64Array.from(this.latent);
  }

  /**
   * Forward + backward for one sample with mean-squared error on the outputs, through the three modules.
   * Accumulates `scale * dLoss/dParams` into `grad` (laid out like `params`) and returns the loss.
   */
  accumulateMse(x: ArrayLike<number>, target: ArrayLike<number>, grad: Float64Array, scale: number): number {
    const n = this.config.outputSize;
    const out = this.logits(x);
    let loss = 0;
    for (let k = 0; k < n; k++) {
      const e = out[k] - target[k];
      loss += (0.5 * e * e) / n;
      this.dOut[k] = e / n;
    }
    const { proprio, scan, motor } = this.offsets;
    const pl = this.config.proprioLatent;
    this.motor.accumulateFromOutput(this.latent, this.dOut, grad.subarray(motor), scale, this.dLatent);
    this.proprio.accumulateFromOutput(this.xp, this.dLatent.subarray(0, pl), grad.subarray(proprio, scan), scale);
    this.scan.accumulateFromOutput(this.xs, this.dLatent.subarray(pl), grad.subarray(scan, motor), scale);
    return loss;
  }
}
