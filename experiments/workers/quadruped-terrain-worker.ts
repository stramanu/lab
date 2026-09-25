/**
 * Worker thread for the terrain spike: plays one episode of one standard condition (the same players as
 * the study, built from the published run-1 network) on one seeded terrain. Deterministic per task.
 */
import { parentPort } from 'node:worker_threads';
import { runEpisode, type Condition } from '../../src/eval/runner';
import { DEFAULT_TERRAIN, QuadrupedEnv, type TerrainConfig } from '../../src/games/quadruped';
import { getGame } from '../../src/games/registry';
import { gameConditions, loadModel } from '../../scripts/lib';

export interface TerrainTask {
  id: number;
  condition: string;
  seed: number;
  terrain: Partial<TerrainConfig>;
  /** Directory of the published network (run 1 of the study). */
  modelDir: string;
}

const REFERENCE_LEVEL = 2;

const game = getGame('quadruped');
const ready = game.init!();
let conditions: Condition[] | null = null;

parentPort!.on('message', async (task: TerrainTask) => {
  try {
    await ready;
    if (!conditions) {
      const model = loadModel(task.modelDir);
      if (!model) throw new Error(`No model in ${task.modelDir}`);
      conditions = gameConditions(game, model, { levels: [REFERENCE_LEVEL], referenceLevel: REFERENCE_LEVEL, measures: [], guard: true });
    }
    const condition = conditions.find((c) => c.name === task.condition);
    if (!condition) throw new Error(`Unknown condition ${task.condition}`);
    const c = game.continuous!;
    const terrain = { ...DEFAULT_TERRAIN, ...task.terrain };
    const record = runEpisode(condition.makePlayer(), task.seed, {
      makeEnv: () => new QuadrupedEnv({ terrain }),
      seeds: [task.seed],
      oracle: c.makeTeacher(REFERENCE_LEVEL),
      agrees: c.agrees,
      oracleEvery: c.oracleEvery,
    });
    parentPort!.postMessage({ id: task.id, record });
  } catch (err) {
    parentPort!.postMessage({ id: task.id, error: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
});
