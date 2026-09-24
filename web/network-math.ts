/** Pure helpers for the 3D network view (no WebGL): which connections to draw. */

export interface Contribution {
  /** Source neuron index. */
  from: number;
  /** Target neuron index. */
  to: number;
  /** weight × source activation. */
  value: number;
}

/**
 * The `k` largest |w_ji · a_i| over a dense layer whose weights are stored
 * row-major per target (W[offset + j * nIn + i]), optionally only into the
 * given targets. Ties are broken by index.
 */
export function topContributions(
  params: ArrayLike<number>,
  offset: number,
  nIn: number,
  nOut: number,
  activation: ArrayLike<number>,
  k: number,
  targets?: readonly number[],
): Contribution[] {
  const all: Contribution[] = [];
  const outs = targets ?? Array.from({ length: nOut }, (_, j) => j);
  for (let i = 0; i < nIn; i++) {
    const a = activation[i];
    if (a === 0) continue;
    for (const j of outs) {
      const value = params[offset + j * nIn + i] * a;
      if (value !== 0) all.push({ from: i, to: j, value });
    }
  }
  all.sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || x.from - y.from || x.to - y.to);
  return all.slice(0, k);
}

/**
 * Connections into the outputs. A global top-k spreads over every output (with 26 letters, about one
 * each, mostly negative ones that push rejected outputs down), so it does not show why the chosen
 * output won. With a chosen output, return the strongest contributions into it (two thirds of k) and
 * into the runner-up (the rest); without one (continuous outputs), the global top-k.
 */
export function outputContributions(
  params: ArrayLike<number>,
  offset: number,
  nIn: number,
  nOut: number,
  activation: ArrayLike<number>,
  probs: ArrayLike<number>,
  chosen: number,
  k: number,
): Contribution[] {
  if (chosen < 0) return topContributions(params, offset, nIn, nOut, activation, k);
  let runnerUp = -1;
  for (let j = 0; j < nOut; j++) if (j !== chosen && (runnerUp < 0 || probs[j] > probs[runnerUp])) runnerUp = j;
  const main = Math.round((k * 2) / 3);
  return [
    ...topContributions(params, offset, nIn, nOut, activation, main, [chosen]),
    ...(runnerUp >= 0 ? topContributions(params, offset, nIn, nOut, activation, k - main, [runnerUp]) : []),
  ];
}
