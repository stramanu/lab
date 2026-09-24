/**
 * Re-evaluates only the `random` condition of a finished study with the per-episode-seeded random
 * player (EXPERIMENTS.md, decision 32), replacing it in the study's cached shared results. Run the
 * study again afterwards (with --workers 1 for studies evaluated sequentially): it re-aggregates from
 * the cached files without training or evaluating anything else.
 * Usage: pnpm tsx scripts/rerun-random.ts --game <name> [--dir artifacts/<game>/study] [--seeds 200]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RandomPlayer } from '../src/core/players';
import { runCondition, seedsFor, type ConditionResult } from '../src/eval';
import { getGame } from '../src/games/registry';
import { num, parseArgs } from './cli';

const args = parseArgs(process.argv.slice(2));
const game = getGame(args.game ?? 'snake');
await game.init?.();
const seeds = seedsFor('test', num(args, 'seeds'));
const path = join(args.dir ?? `artifacts/${game.name}/study`, `shared-test-${seeds.length}.json`);
const shared = JSON.parse(readFileSync(path, 'utf8')) as ConditionResult[];
const i = shared.findIndex((c) => c.name === 'random');
if (i < 0) throw new Error(`No random condition in ${path}`);
const before = shared[i].score.mean;
shared[i] = runCondition({ name: 'random', kind: 'random', params: {}, makePlayer: () => new RandomPlayer(0) }, { makeEnv: game.makeEnv, seeds });
writeFileSync(path, JSON.stringify(shared));
console.log(`${game.name}: random ${before.toFixed(3)} → ${shared[i].score.mean.toFixed(3)} (${path})`);
