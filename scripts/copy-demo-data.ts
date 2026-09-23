/**
 * Publishes the demo data for every registered game that has a finished test study:
 * `<game>-weights.json` (run 1 of the study, fixed in advance, not the best run) and
 * `<game>-study.json` (the aggregated 5-run test results).
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GAMES } from '../src/games/registry';

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
if (!published) process.exit(1);
