/**
 * Seed splits. They are pairwise disjoint:
 * - test (1–200): final, published numbers only;
 * - dev (10,001–10,200): every design decision, ablation and experiment;
 * - training episodes: TRAIN_SEED_START and above.
 */
export type Split = 'test' | 'dev';

const range = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);

export const SPLITS: Record<Split, readonly number[]> = {
  test: range(1, 200),
  dev: range(10_001, 200),
};

export const TRAIN_SEED_START = 1_000_000;

/** The first `n` seeds (default all) of a split. */
export function seedsFor(split: Split, n?: number): number[] {
  const seeds = SPLITS[split];
  return seeds.slice(0, n ?? seeds.length);
}

/** Split a seed belongs to, or 'train' / null. */
export function splitOf(seed: number): Split | 'train' | null {
  if (seed >= TRAIN_SEED_START) return 'train';
  for (const split of Object.keys(SPLITS) as Split[]) if (SPLITS[split].includes(seed)) return split;
  return null;
}

export function parseSplit(value: string | undefined): Split {
  if (value === undefined || value === 'dev') return 'dev';
  if (value === 'test') return 'test';
  throw new Error(`Unknown split "${value}". Use "dev" or "test".`);
}
