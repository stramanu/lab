export function mean(xs: ArrayLike<number>): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

export function median(xs: ArrayLike<number>): number {
  if (xs.length === 0) return NaN;
  const sorted = Array.from(xs).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sample standard deviation (n - 1). */
export function std(xs: ArrayLike<number>): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** Half-width of the 95% confidence interval of the mean (normal approximation). */
export function ci95(xs: ArrayLike<number>): number {
  if (xs.length < 2) return 0;
  return (1.96 * std(xs)) / Math.sqrt(xs.length);
}
