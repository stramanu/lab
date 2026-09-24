import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  encodeRaster,
  encodeTrajectory,
  greedyCloudMatch,
  labelledData,
  MlpRecognizer,
  parseUji,
  pdollarCloud,
  PDollarRecognizer,
  preprocess,
  selectSplit,
  writerSplits,
  type Sample,
} from '../src/handwriting';
import { evaluate } from '../src/nn';
import { loadSamples } from '../scripts/handwriting-lib';

const samples = loadSamples();

describe('handwriting data', () => {
  it('parses the UJI format with CRLF line endings and keeps only uppercase letters', () => {
    const text = [
      '// ASCII char: a',
      'WORD a trn_UJI_W01-01',
      '  NUMSTROKES 1',
      '  POINTS 2 # 1 2 3 4',
      'WORD B tst_UPV_W07-02',
      '  NUMSTROKES 2',
      '  POINTS 2 # 0 0 0 10',
      '  POINTS 1 # 5 5',
    ].join('\r\n');
    expect(parseUji(text)).toEqual([{ writer: 'tst_UPV_W07', label: 1, strokes: [[0, 0, 0, 10], [5, 5]] }]);
  });

  it('splits writers into disjoint train, dev and test sets that cover everyone', () => {
    const split = writerSplits(samples.map((s) => s.writer));
    const bySplit = { train: new Set<string>(), dev: new Set<string>(), test: new Set<string>() };
    for (const [w, s] of split) bySplit[s].add(w);
    expect([bySplit.train.size, bySplit.dev.size, bySplit.test.size]).toEqual([30, 10, 20]);
    expect(split.size).toBe(60);
    for (const w of bySplit.test) expect(w.startsWith('tst_')).toBe(true);
  });

  it('refuses test writers outside the study', () => {
    expect(() => selectSplit(samples, ['dev', 'test'])).toThrow(/reserved/);
    expect(selectSplit(samples, ['test'], { allowTest: true })).toHaveLength(1040);
  });
});

describe('handwriting preprocessing', () => {
  it('produces 32 points in [−1, 1] with the larger side spanning the range', () => {
    for (const s of samples.slice(0, 200)) {
      const p = preprocess(s.strokes);
      expect(p.x.length).toBe(32);
      for (let i = 0; i < 32; i++) {
        expect(Math.abs(p.x[i])).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(p.y[i])).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    const line = preprocess([[0, 0, 0, 50, 0, 100]]);
    expect(Math.min(...line.y)).toBeCloseTo(-1);
    expect(Math.max(...line.y)).toBeCloseTo(1);
  });

  it('keeps the aspect ratio of a tall, thin stroke', () => {
    const p = preprocess([[0, 0, 10, 50, 0, 100]]);
    expect(Math.max(...p.x) - Math.min(...p.x)).toBeLessThan(Math.max(...p.y) - Math.min(...p.y));
  });

  it('augments deterministically given the seed', () => {
    const a = preprocess(samples[0].strokes, Rng.stream(7, 'aug'));
    const b = preprocess(samples[0].strokes, Rng.stream(7, 'aug'));
    const plain = preprocess(samples[0].strokes);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(Array.from(a.x)).not.toEqual(Array.from(plain.x));
  });
});

describe('handwriting encodings', () => {
  it('have the declared sizes and ranges', () => {
    for (const s of samples.slice(0, 100)) {
      const p = preprocess(s.strokes);
      const t = encodeTrajectory(p);
      const r = encodeRaster(p);
      expect(t.length).toBe(160);
      expect(t.every(Number.isFinite)).toBe(true);
      expect(r.length).toBe(256);
      expect(r.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(r.some((v) => v > 0)).toBe(true);
    }
  });
});

describe('MLP recogniser', () => {
  const train = selectSplit(samples, ['train']);

  it('trains deterministically given the run seed', () => {
    const subset = train.slice(0, 100);
    const a = MlpRecognizer.train(subset, { encoding: 'trajectory', seed: 3, epochs: 2, hidden: [16, 16] });
    const b = MlpRecognizer.train(subset, { encoding: 'trajectory', seed: 3, epochs: 2, hidden: [16, 16] });
    expect(Array.from(a.net.params)).toEqual(Array.from(b.net.params));
  });

  it('learns the training writers (≥ 95% top-1 on unaugmented training samples)', () => {
    for (const encoding of ['trajectory', 'raster'] as const) {
      const model = MlpRecognizer.train(train, { encoding, seed: 1, epochs: 60, hidden: [64, 64] });
      expect(evaluate(model.net, labelledData(train, encoding)).agreement).toBeGreaterThanOrEqual(0.95);
    }
  }, 120_000);

  it('counts 2 operations per multiply–accumulate', () => {
    const model = MlpRecognizer.train(train.slice(0, 10), { encoding: 'trajectory', seed: 1, epochs: 1, hidden: [64, 64] });
    expect(model.cost).toBe(2 * (160 * 64 + 64 * 64 + 64 * 26));
  });
});

describe('$P recogniser', () => {
  const templates = selectSplit(samples, ['train']).slice(0, 260);
  const p = PDollarRecognizer.fromSamples(templates);

  it('recognises one of its own templates at distance 0', () => {
    const r = p.recognize(templates[5].strokes);
    expect(r.top[0]).toEqual({ label: templates[5].label, score: 0 });
    expect(r.cost).toBeGreaterThan(0);
  });

  it('is invariant to stroke order and direction', () => {
    const multi = templates.filter((s: Sample) => s.strokes.length >= 3).slice(0, 5);
    expect(multi.length).toBeGreaterThan(0);
    for (const s of multi) {
      const reordered = [...s.strokes].reverse();
      const reversed = s.strokes.map((stroke, i) => (i === 0 ? reversedStroke(stroke) : stroke));
      expect(p.recognize(reordered).top[0].label).toBe(s.label);
      expect(p.recognize(reversed).top[0].label).toBe(s.label);
    }
  });

  it('gives a cloud distance of 0 between identical clouds', () => {
    const c = pdollarCloud(templates[0].strokes);
    expect(greedyCloudMatch(c, c)).toBe(0);
  });
});

function reversedStroke(stroke: number[]): number[] {
  const out: number[] = [];
  for (let i = stroke.length - 2; i >= 0; i -= 2) out.push(stroke[i], stroke[i + 1]);
  return out;
}
