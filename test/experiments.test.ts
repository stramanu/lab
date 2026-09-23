import { describe, expect, it } from 'vitest';
import { assertNoTestSeeds } from '../experiments/common';

describe('experiment guards', () => {
  it('rejects any test seed', () => {
    expect(() => assertNoTestSeeds([10_001, 10_002])).not.toThrow();
    expect(() => assertNoTestSeeds([10_001, 17])).toThrow(/test seeds/);
  });
});
