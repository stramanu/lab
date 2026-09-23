import { describe, expect, it } from 'vitest';
import { ci95, mean, median, std } from '../src/core/stats';
import { argmax } from '../src/core/types';

describe('stats', () => {
  it('mean, median, standard deviation', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('95% CI', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(ci95(xs)).toBeCloseTo((1.96 * 2.138) / Math.sqrt(8), 3);
    expect(ci95([5])).toBe(0);
  });

  it('argmax respects the mask', () => {
    expect(argmax([1, 5, 3])).toBe(1);
    expect(argmax([1, 5, 3], [true, false, true])).toBe(2);
  });
});
