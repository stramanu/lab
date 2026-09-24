/** Shared helpers for experiment scripts: result writing with split checks, and a cached reference model. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitOf } from '../src/eval';
import { getGame } from '../src/games/registry';
import { loadModel, trainGame, type LoadedModel } from '../scripts/lib';

export interface ExperimentResult {
  /** The README claim this experiment supports, in one sentence. */
  claim: string;
  split: 'dev';
  /** Every evaluation seed played. Training data comes from training seeds. */
  seeds: number[];
  config: Record<string, unknown>;
  results: Record<string, unknown>;
}

export const RESULTS_DIR = 'artifacts/experiments';

/** Throws if any seed belongs to the test split: experiments must never touch it. */
export function assertNoTestSeeds(seeds: readonly number[]): void {
  const leaked = seeds.filter((s) => splitOf(s) === 'test');
  if (leaked.length) throw new Error(`Experiment used test seeds: ${leaked.slice(0, 5).join(', ')}…`);
}

export function writeResult(name: string, result: ExperimentResult): string {
  assertNoTestSeeds(result.seeds);
  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = join(RESULTS_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify({ name, createdAt: new Date().toISOString(), ...result }, null, 2));
  return path;
}

/** Default-configuration model for a game (pipeline seed 1), trained once and cached. */
export function referenceModel(gameName: string): LoadedModel {
  const dir = join(RESULTS_DIR, 'models', gameName);
  const cached = loadModel(dir);
  if (cached) return cached;
  const game = getGame(gameName);
  console.log(`Training the reference ${gameName} model (cached in ${dir})…`);
  trainGame(game, { seed: 1 }, dir, game.referenceLevel, true);
  return loadModel(dir)!;
}

/** AUROC: probability that a random positive scores higher than a random negative (ties count half; Mann–Whitney U). */
export function auroc(scores: number[], positive: boolean[]): number {
  const rows = scores.map((s, i) => ({ s, p: positive[i] })).sort((a, b) => a.s - b.s);
  let sumPos = 0;
  let nPos = 0;
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && rows[j].s === rows[i].s) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (rows[k].p) {
      sumPos += avgRank;
      nPos++;
    }
    i = j;
  }
  const nNeg = rows.length - nPos;
  return nPos && nNeg ? (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : NaN;
}
