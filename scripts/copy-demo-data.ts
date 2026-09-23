/** Copies the trained weights and the evaluation report into the demo's public data folder. */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = 'artifacts/snake';
const dst = 'web/public/data';
mkdirSync(dst, { recursive: true });
for (const [from, to] of [
  ['weights.json', 'snake-weights.json'],
  ['eval-report.json', 'snake-eval-report.json'],
]) {
  const path = join(src, from);
  if (!existsSync(path)) {
    console.error(`Missing ${path}: run \`pnpm train:snake\` and \`pnpm eval:snake\` first.`);
    process.exit(1);
  }
  copyFileSync(path, join(dst, to));
  console.log(`${path} → ${join(dst, to)}`);
}
