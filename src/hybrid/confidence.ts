export type ConfidenceMeasure = 'maxProb' | 'margin';

/** Confidence of a policy: its top probability, or the gap between the top two. */
export function confidence(probs: ArrayLike<number>, measure: ConfidenceMeasure): number {
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (p > p1) {
      p2 = p1;
      p1 = p;
    } else if (p > p2) {
      p2 = p;
    }
  }
  return measure === 'maxProb' ? p1 : p1 - p2;
}
