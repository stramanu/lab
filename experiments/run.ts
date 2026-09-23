/**
 * Runs one experiment by name and writes artifacts/experiments/<name>.json.
 * Usage: pnpm exp <name>    (names: the files in experiments/ other than run.ts and common.ts)
 */
import { readdirSync } from 'node:fs';
import { writeResult, type ExperimentResult } from './common';

const name = process.argv[2];
const available = readdirSync(new URL('.', import.meta.url))
  .filter((f) => f.endsWith('.ts') && !['run.ts', 'common.ts'].includes(f))
  .map((f) => f.replace(/\.ts$/, ''));
if (!name || !available.includes(name)) {
  console.error(`Usage: pnpm exp <name>. Available: ${available.join(', ')}`);
  process.exit(1);
}
const mod = (await import(`./${name}.ts`)) as { run(): Promise<ExperimentResult> | ExperimentResult };
const t0 = performance.now();
const result = await mod.run();
const path = writeResult(name, result);
console.log(JSON.stringify(result.results, null, 2));
console.log(`\n${name} done in ${((performance.now() - t0) / 1000).toFixed(0)}s → ${path}`);
