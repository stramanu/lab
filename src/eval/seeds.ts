/** Fixed, published evaluation seeds: 1..n. Training seeds start at 1,000,000, so the sets are disjoint. */
export function evalSeeds(n = 200): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
