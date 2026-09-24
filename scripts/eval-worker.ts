/**
 * Evaluation worker thread: rebuilds a game's conditions from a model directory (closures cannot
 * cross threads), plays the requested seeds of one condition and returns the episode records.
 */
import { parentPort } from 'node:worker_threads';
import { runEpisode, type Condition } from '../src/eval/runner';
import { getGame } from '../src/games/registry';
import { plannerEpisode } from '../src/training/continuous-pipeline';
import { gameConditions, loadModel, type ConditionOptions } from './lib';

/** A planner-driven bootstrap episode for a continuous game (states and labels flattened). */
export interface BootstrapTask {
  kind: 'bootstrap';
  id: number;
  game: string;
  level: number;
  seed: number;
}

export interface EvalTask {
  id: number;
  game: string;
  modelDir: string;
  options: ConditionOptions;
  condition: string;
  seeds: number[];
  referenceLevel: number;
}

const conditionsCache = new Map<string, Condition[]>();

parentPort!.on('message', async (task: EvalTask | BootstrapTask) => {
  try {
    const game = getGame(task.game);
    await game.init?.();
    if ('kind' in task) {
      const c = game.continuous!;
      const ep = plannerEpisode(c.makeEnv, c.makeTeacher(task.level), task.seed);
      const n = ep.states.length;
      const states = new Float32Array(n * (ep.states[0]?.length ?? 0));
      const labels = new Float64Array(n * (ep.labels[0]?.length ?? 0));
      ep.states.forEach((s, i) => states.set(s, i * s.length));
      ep.labels.forEach((l, i) => labels.set(l, i * l.length));
      parentPort!.postMessage({ id: task.id, bootstrap: { n, states, labels, score: ep.score } }, [states.buffer, labels.buffer]);
      return;
    }
    const key = `${task.game}|${task.modelDir}|${JSON.stringify(task.options)}`;
    if (!conditionsCache.has(key)) {
      const model = loadModel(task.modelDir);
      if (!model) throw new Error(`No model in ${task.modelDir}`);
      conditionsCache.set(key, gameConditions(game, model, task.options));
    }
    const condition = conditionsCache.get(key)!.find((c) => c.name === task.condition);
    if (!condition) throw new Error(`Unknown condition ${task.condition}`);
    const oracle = game.continuous ? game.continuous.makeTeacher(task.referenceLevel) : game.makeTeacher(task.referenceLevel);
    const player = condition.makePlayer();
    const records = task.seeds.map((seed) => runEpisode(player, seed, { makeEnv: game.makeEnv, seeds: [seed], oracle, agrees: game.continuous?.agrees, oracleEvery: game.continuous?.oracleEvery }));
    parentPort!.postMessage({ id: task.id, records });
  } catch (err) {
    parentPort!.postMessage({ id: task.id, error: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
});
