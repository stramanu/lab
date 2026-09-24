/**
 * Downloads UJI Pen Characters v2 from the UCI Machine Learning Repository, checks the archive's
 * SHA-256, extracts the uppercase letters and writes data/uji-upper.json with an attribution notice.
 * Usage: pnpm hw:data
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { LETTERS, parseUji, writerSplits } from '../src/handwriting/data';

const URL_ZIP = 'https://archive.ics.uci.edu/static/public/177/uji+pen+characters+version+2.zip';
const SHA256 = '0881b522911b99d9922820289441b50fd3d307f71cd7f9cc70e86872424a5f90';
const ENTRY = 'ujipenchars2.txt';

/** Reads one entry of a zip archive (stored or deflated) through its central directory. */
function unzipEntry(zip: Buffer, name: string): Buffer {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a zip archive');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`Unsupported zip method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not found in the archive`);
}

const response = await fetch(URL_ZIP);
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
const zip = Buffer.from(await response.arrayBuffer());
const hash = createHash('sha256').update(zip).digest('hex');
if (hash !== SHA256) throw new Error(`Archive hash mismatch: expected ${SHA256}, got ${hash}. Nothing written.`);

const samples = parseUji(unzipEntry(zip, ENTRY).toString('latin1'));

// Report deviations from 2 samples per writer and letter instead of dropping anything silently.
const counts = new Map<string, number>();
for (const s of samples) counts.set(`${s.writer} ${LETTERS[s.label]}`, (counts.get(`${s.writer} ${LETTERS[s.label]}`) ?? 0) + 1);
const writers = [...new Set(samples.map((s) => s.writer))].sort();
const deviations: string[] = [];
for (const w of writers) for (const l of LETTERS) if ((counts.get(`${w} ${l}`) ?? 0) !== 2) deviations.push(`${w} ${l}: ${counts.get(`${w} ${l}`) ?? 0}`);
const split = writerSplits(writers);
const perSplit = { train: 0, dev: 0, test: 0 };
for (const s of samples) perSplit[split.get(s.writer)!]++;

mkdirSync('data', { recursive: true });
writeFileSync(
  'data/uji-upper.json',
  JSON.stringify({
    source: 'UJI Pen Characters (Version 2), UCI Machine Learning Repository, CC BY 4.0',
    archiveSha256: SHA256,
    units: '100 per mm, y downwards',
    letters: LETTERS,
    samples: samples.map((s) => ({ w: s.writer, l: s.label, s: s.strokes })),
  }),
);
writeFileSync(
  'data/NOTICE.md',
  `# Data notice

\`uji-upper.json\` is derived from **UJI Pen Characters (Version 2)**: the 26 uppercase letters A–Z
(3,120 samples, 60 writers), with points kept exactly as in the source. It is redistributed under the
same licence, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- Source: UCI Machine Learning Repository, https://doi.org/10.24432/C5FG8S
- Paper: Llorens, D., Prat, F., Marzal, A., Vilar, J. M., Castro, M. J., et al. (2008). The UJIpenchars
  Database: a Pen-Based Database of Isolated Handwritten Characters. *LREC 2008*.
- Changes: only the uppercase letters are kept, in a compact JSON format. Regenerate with \`pnpm hw:data\`.
`,
);
console.log(`${samples.length} samples, ${writers.length} writers; per split: ${JSON.stringify(perSplit)}`);
console.log(deviations.length ? `Deviations from 2 per writer and letter:\n${deviations.join('\n')}` : 'Every writer has 2 samples of every letter.');
