import { Rng } from '../core/rng';
import { ArrayTrainData, fitTemperature, Mlp, Trainer, exportPolicy, importPolicy, type SerializedPolicy } from '../nn';
import { LETTERS, type Sample } from './data';
import { encode, ENCODING_SIZE, type HandwritingEncoding } from './encoding';
import { preprocess } from './preprocess';

export interface Candidate {
  label: number;
  /** Calibrated probability (MLP) or cloud distance ($P). */
  score: number;
}

export interface Recognition {
  top: Candidate[];
  /** Arithmetic operations spent on this recognition. */
  cost: number;
}

export interface HandwritingTrainConfig {
  encoding: HandwritingEncoding;
  /** Run seed: initialisation, augmentation and batch order. */
  seed: number;
  epochs: number;
  hidden: [number, number];
}

export const DEFAULT_HANDWRITING_TRAIN: Omit<HandwritingTrainConfig, 'encoding' | 'seed'> = { epochs: 60, hidden: [64, 64] };

const NUM_CLASSES = LETTERS.length;
const ALL_LEGAL = new Uint8Array(NUM_CLASSES).fill(1);

function oneHot(label: number): Float32Array {
  const y = new Float32Array(NUM_CLASSES);
  y[label] = 1;
  return y;
}

/** Unaugmented, labelled encodings (evaluation and temperature fitting). */
export function labelledData(samples: Sample[], encoding: HandwritingEncoding): ArrayTrainData {
  return new ArrayTrainData(
    samples.map((s) => encode(preprocess(s.strokes), encoding)),
    samples.map((s) => oneHot(s.label)),
    samples.map(() => ALL_LEGAL),
  );
}

/** System One for handwriting: an MLP over one encoding, with a temperature fitted on dev writers. */
export class MlpRecognizer {
  constructor(
    readonly net: Mlp,
    readonly encoding: HandwritingEncoding,
    public temperature = 1,
  ) {}

  /** Operations per recognition: 2 per multiply–accumulate of the forward pass. */
  get cost(): number {
    const { inputSize: n0, hidden: [n1, n2], outputSize: n3 } = this.net.config;
    return 2 * (n0 * n1 + n1 * n2 + n2 * n3);
  }

  input(strokes: number[][]): Float32Array {
    return encode(preprocess(strokes), this.encoding);
  }

  recognize(strokes: number[][], k = 5): Recognition {
    const probs = this.net.probs(this.input(strokes), ALL_LEGAL, this.temperature);
    const top = Array.from(probs, (score, label) => ({ label, score }))
      .sort((a, b) => b.score - a.score || a.label - b.label)
      .slice(0, k);
    return { top, cost: this.cost };
  }

  static train(train: Sample[], config: HandwritingTrainConfig): MlpRecognizer {
    const net = new Mlp({ inputSize: ENCODING_SIZE[config.encoding], hidden: config.hidden, outputSize: NUM_CLASSES, seed: config.seed });
    const trainer = new Trainer(net, {}, config.seed);
    const augmentRng = Rng.stream(config.seed, 'handwriting-augment');
    const ys = train.map((s) => oneHot(s.label));
    const masks = train.map(() => ALL_LEGAL);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
      // Fresh distortions every epoch, drawn from the run's seeded stream.
      const xs = train.map((s) => encode(preprocess(s.strokes, augmentRng), config.encoding));
      trainer.train(new ArrayTrainData(xs, ys, masks), { epochs: 1 });
    }
    return new MlpRecognizer(net, config.encoding);
  }

  /** Temperature scaling on held-out writers (Guo et al. 2017). */
  calibrate(dev: Sample[]): number {
    this.temperature = fitTemperature(this.net, labelledData(dev, this.encoding)).temperature;
    return this.temperature;
  }

  export(meta: Record<string, unknown> = {}): SerializedPolicy {
    return exportPolicy(this.net, this.temperature, { ...meta, encoding: this.encoding });
  }

  static import(data: SerializedPolicy): MlpRecognizer {
    const { net, calibrationT, meta } = importPolicy(data);
    return new MlpRecognizer(net, meta?.encoding as HandwritingEncoding, calibrationT);
  }
}
