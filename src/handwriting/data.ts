/**
 * UJI Pen Characters v2, uppercase subset: sample format, parsing of the
 * source file, and the writer-independent split.
 * Source: Llorens et al. (2008), LREC; UCI Machine Learning Repository, CC BY 4.0.
 */

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** One handwritten character: strokes as flat [x0, y0, x1, y1, …] arrays in source units (y downwards). */
export interface Sample {
  writer: string;
  label: number;
  strokes: number[][];
}

export type HandwritingSplit = 'train' | 'dev' | 'test';

/**
 * Parses `ujipenchars2.txt` and keeps the uppercase letters A–Z.
 * Entries look like `WORD A trn_UJI_W01-01`, then `NUMSTROKES n`, then n lines `POINTS k # x y x y …`.
 */
export function parseUji(text: string): Sample[] {
  const lines = text.split(/\r?\n/);
  const samples: Sample[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^WORD (\S) (\S+)-\d+$/.exec(lines[i].trim());
    if (!m) continue;
    const numStrokes = Number(/NUMSTROKES (\d+)/.exec(lines[i + 1])?.[1]);
    if (!Number.isInteger(numStrokes)) throw new Error(`Malformed entry at line ${i + 1}`);
    const strokes: number[][] = [];
    for (let s = 0; s < numStrokes; s++) {
      const pm = /POINTS (\d+) # (.*)$/.exec(lines[i + 2 + s]);
      if (!pm) throw new Error(`Malformed stroke at line ${i + 3 + s}`);
      const xy = pm[2].trim().split(/\s+/).map(Number);
      if (xy.length !== 2 * Number(pm[1])) throw new Error(`Point count mismatch at line ${i + 3 + s}`);
      strokes.push(xy);
    }
    i += 1 + numStrokes;
    const label = LETTERS.indexOf(m[1]);
    if (label >= 0) samples.push({ writer: m[2], label, strokes });
  }
  return samples;
}

/**
 * Writer-independent split, fixed in the proposal: the database's "tst" writers are test;
 * its "trn" writers, sorted by identifier, go to dev when their index mod 4 is 0 and to train otherwise.
 */
export function writerSplits(writers: Iterable<string>): Map<string, HandwritingSplit> {
  const unique = [...new Set(writers)].sort();
  const split = new Map<string, HandwritingSplit>();
  let trn = 0;
  for (const w of unique) {
    if (w.startsWith('tst_')) split.set(w, 'test');
    else if (w.startsWith('trn_')) split.set(w, trn++ % 4 === 0 ? 'dev' : 'train');
    else throw new Error(`Unknown writer set: ${w}`);
  }
  return split;
}

/**
 * The samples of the requested splits. Test samples are available only to the study:
 * any other caller that asks for them gets an error, as with test seeds in the games.
 */
export function selectSplit(samples: Sample[], splits: HandwritingSplit[], options: { allowTest?: boolean } = {}): Sample[] {
  if (splits.includes('test') && !options.allowTest) throw new Error('Test writers are reserved for the final study');
  const byWriter = writerSplits(samples.map((s) => s.writer));
  return samples.filter((s) => splits.includes(byWriter.get(s.writer)!));
}
