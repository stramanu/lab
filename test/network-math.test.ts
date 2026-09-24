import { describe, expect, it } from 'vitest';
import { outputContributions, topContributions } from '../web/network-math';

describe('topContributions', () => {
  it('returns the k largest |w·a| with sign, skipping inactive sources', () => {
    // 3 inputs -> 2 outputs, weights row-major per output: W[j*3 + i].
    const W = [1, -4, 2, /* out 1 */ 0.5, 3, -6];
    const a = [2, 1, 0]; // input 2 inactive
    const top = topContributions(W, 0, 3, 2, a, 3);
    expect(top).toEqual([
      { from: 1, to: 0, value: -4 },
      { from: 1, to: 1, value: 3 },
      { from: 0, to: 0, value: 2 },
    ]);
  });

  it('respects the parameter offset and k', () => {
    const W = [99, 99, 1, 2];
    expect(topContributions(W, 2, 2, 1, [1, 1], 1)).toEqual([{ from: 1, to: 0, value: 2 }]);
  });
});

describe('outputContributions', () => {
  // 2 hidden units -> 3 outputs, W[j*2 + i]. Output 2 has the largest |w·a| overall.
  const W = [1, 0.5, /* out 1 */ 0.2, 0.1, /* out 2 */ -9, 8];
  const a = [1, 1];

  it('draws only into the chosen output and the runner-up', () => {
    const edges = outputContributions(W, 0, 2, 3, a, [0.7, 0.2, 0.1], 0, 3);
    expect(edges.map((e) => e.to)).toEqual([0, 0, 1]);
    expect(edges[0]).toEqual({ from: 0, to: 0, value: 1 });
  });

  it('falls back to the global top-k without a chosen output', () => {
    expect(outputContributions(W, 0, 2, 3, a, [0.7, 0.2, 0.1], -1, 2).map((e) => e.to)).toEqual([2, 2]);
  });
});

