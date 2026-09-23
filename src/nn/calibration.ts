import { argmax } from '../core/types';
import { crossEntropy, maskedSoftmax } from './math';
import type { Mlp } from './mlp';
import type { TrainData } from './train';

export interface ReliabilityBin {
  lower: number;
  upper: number;
  count: number;
  meanConfidence: number;
  accuracy: number;
}

export interface Reliability {
  /** Expected calibration error: sum over bins of (count / n) * |accuracy - confidence|. */
  ece: number;
  bins: ReliabilityBin[];
}

/** ECE and reliability-diagram data from per-decision confidences and correctness. */
export function reliability(confidences: ArrayLike<number>, correct: ArrayLike<boolean>, numBins = 10): Reliability {
  const n = confidences.length;
  const count = new Array(numBins).fill(0);
  const confSum = new Array(numBins).fill(0);
  const hits = new Array(numBins).fill(0);
  for (let i = 0; i < n; i++) {
    const c = confidences[i];
    const b = Math.min(numBins - 1, Math.max(0, Math.floor(c * numBins)));
    count[b]++;
    confSum[b] += c;
    if (correct[i]) hits[b]++;
  }
  let ece = 0;
  const bins: ReliabilityBin[] = [];
  for (let b = 0; b < numBins; b++) {
    const meanConfidence = count[b] ? confSum[b] / count[b] : 0;
    const accuracy = count[b] ? hits[b] / count[b] : 0;
    if (n > 0) ece += (count[b] / n) * Math.abs(accuracy - meanConfidence);
    bins.push({ lower: b / numBins, upper: (b + 1) / numBins, count: count[b], meanConfidence, accuracy });
  }
  return { ece, bins };
}

/** Log-spaced candidate temperatures in [0.25, 5], always including exactly 1. */
export function temperatureGrid(points = 41): number[] {
  const lo = Math.log(0.25);
  const hi = Math.log(5);
  const grid = Array.from({ length: points }, (_, i) => Math.exp(lo + ((hi - lo) * i) / (points - 1)));
  grid.push(1);
  return grid.sort((a, b) => a - b);
}

export interface TemperatureFit {
  temperature: number;
  nll: number;
  nllAtOne: number;
}

/**
 * Temperature scaling: pick the T that minimizes validation NLL (soft-label
 * cross-entropy). Because T = 1 is always a candidate, calibration never
 * makes the validation NLL worse.
 */
export function fitTemperature(net: Mlp, data: TrainData): TemperatureFit {
  const logits: Float64Array[] = [];
  for (let i = 0; i < data.size; i++) logits.push(Float64Array.from(net.logits(data.x(i))));
  const probs = new Float64Array(net.config.outputSize);
  const nllAt = (t: number) => {
    let s = 0;
    for (let i = 0; i < data.size; i++) {
      maskedSoftmax(logits[i], data.legal(i), t, probs);
      s += crossEntropy(data.y(i), probs);
    }
    return data.size ? s / data.size : NaN;
  };
  const nllAtOne = nllAt(1);
  let best = { temperature: 1, nll: nllAtOne };
  for (const t of temperatureGrid()) {
    const v = nllAt(t);
    if (v < best.nll) best = { temperature: t, nll: v };
  }
  return { ...best, nllAtOne };
}

/** Reliability of the network against the target argmax on a labeled set. */
export function networkReliability(net: Mlp, data: TrainData, temperature: number, numBins = 10): Reliability {
  const conf: number[] = [];
  const correct: boolean[] = [];
  const probs = new Float32Array(net.config.outputSize);
  for (let i = 0; i < data.size; i++) {
    const legal = Array.from(data.legal(i), Boolean);
    net.probs(data.x(i), legal, temperature, probs);
    const choice = argmax(probs, legal);
    conf.push(probs[choice]);
    correct.push(choice === argmax(data.y(i), legal));
  }
  return reliability(conf, correct, numBins);
}
