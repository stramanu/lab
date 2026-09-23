/**
 * Masked, numerically stable softmax of `logits / temperature` into `out`.
 * Masked-out entries get probability exactly 0.
 */
export function maskedSoftmax(
  logits: ArrayLike<number>,
  legal: ArrayLike<number | boolean> | null,
  temperature: number,
  out: Float32Array | Float64Array,
): void {
  const n = logits.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) if ((!legal || legal[i]) && logits[i] / temperature > max) max = logits[i] / temperature;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (legal && !legal[i]) {
      out[i] = 0;
      continue;
    }
    const e = Math.exp(logits[i] / temperature - max);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < n; i++) out[i] /= sum;
}

/** Soft labels from teacher scores: softmax(scores / tau) over legal, finite scores. */
export function softLabels(scores: ArrayLike<number>, legal: ArrayLike<number | boolean>, tau: number): Float32Array {
  const mask = Array.from({ length: scores.length }, (_, i) => Boolean(legal[i]) && Number.isFinite(scores[i]));
  const out = new Float32Array(scores.length);
  maskedSoftmax(scores, mask, tau, out);
  return out;
}

/** Cross-entropy -sum(y * log p) with p clamped away from zero. */
export function crossEntropy(target: ArrayLike<number>, probs: ArrayLike<number>): number {
  let loss = 0;
  for (let i = 0; i < target.length; i++) if (target[i] > 0) loss -= target[i] * Math.log(Math.max(probs[i], 1e-12));
  return loss;
}
