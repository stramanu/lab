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
 * row-major per target (W[offset + j * nIn + i]). Ties are broken by index.
 */
export function topContributions(
  params: ArrayLike<number>,
  offset: number,
  nIn: number,
  nOut: number,
  activation: ArrayLike<number>,
  k: number,
): Contribution[] {
  const all: Contribution[] = [];
  for (let i = 0; i < nIn; i++) {
    const a = activation[i];
    if (a === 0) continue;
    for (let j = 0; j < nOut; j++) {
      const value = params[offset + j * nIn + i] * a;
      if (value !== 0) all.push({ from: i, to: j, value });
    }
  }
  all.sort((x, y) => Math.abs(y.value) - Math.abs(x.value) || x.from - y.from || x.to - y.to);
  return all.slice(0, k);
}
