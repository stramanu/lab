/**
 * Publishes the demo data for every registered game that has a finished test study:
 * `<game>-weights.json` (run 1 of the study, fixed in advance, not the best run) and
 * `<game>-study.json` (the aggregated 5-run test results). For the handwriting page it also
 * publishes the $P templates: the training writers' samples, unchanged, so the page's $P is the study's.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAMES } from '../src/games/registry';
import { selectSplit } from '../src/handwriting';
import { loadSamples } from './handwriting-lib';

const dst = 'web/public/data';
mkdirSync(dst, { recursive: true });
rmSync(join(dst, 'snake-eval-report.json'), { force: true });

let published = 0;
for (const name of Object.keys(GAMES)) {
  const weights = join('artifacts', name, 'study', 'run-1', 'weights.json');
  const study = join('artifacts', name, 'study', 'study-test-200.json');
  if (!existsSync(weights) || !existsSync(study)) {
    console.warn(`Skipping ${name}: run \`pnpm study --game ${name} --runs 5 --split test\` first.`);
    continue;
  }
  copyFileSync(weights, join(dst, `${name}-weights.json`));
  copyFileSync(study, join(dst, `${name}-study.json`));
  console.log(`${name}: ${weights} and ${study} → ${dst}/`);
  published++;
}
const hw = { weights: 'artifacts/handwriting/study/run-1/weights.json', study: 'artifacts/handwriting/study/study-test.json' };
if (existsSync(hw.weights) && existsSync(hw.study)) {
  copyFileSync(hw.weights, join(dst, 'handwriting-weights.json'));
  copyFileSync(hw.study, join(dst, 'handwriting-study.json'));
  const templates = selectSplit(loadSamples(), ['train']).map((s) => ({ l: s.label, s: s.strokes }));
  writeFileSync(
    join(dst, 'handwriting-templates.json'),
    JSON.stringify({ source: 'UJI Pen Characters v2, training writers (CC BY 4.0)', samples: templates }),
  );
  console.log(`handwriting: ${hw.weights}, ${hw.study} and ${templates.length} $P templates → ${dst}/`);
  published++;
} else {
  console.warn('Skipping handwriting: run `pnpm hw:study` first.');
}
if (!published) process.exit(1);
