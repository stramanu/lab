/**
 * Worker thread for the quadruped experiments: plays episodes (planner-labelled data collection,
 * or evaluation of a driver) and trains single ensemble members. Deterministic per task.
 */
import { parentPort } from 'node:worker_threads';
import { CANDIDATES, initQuadrupedPhysics, QuadrupedEnv, QuadrupedTeacher } from '../../src/games/quadruped';
import { Ensemble, importEnsemble, type EnsembleConfig, type SerializedEnsemble } from '../../src/nn';

/** Who plays the actions: the planner, the base controller, or a named ensemble version. */
export type Driver = 'planner' | 'base' | { key: string; model: SerializedEnsemble };

export type WorkerTask =
  | { type: 'collect'; id: number; seed: number; J: number; driver: Driver }
  | { type: 'play'; id: number; seed: number; J: number; driver: Driver }
  | { type: 'member-init'; id: number; config: EnsembleConfig; k: number }
  | { type: 'member-train'; id: number; xs: Float32Array; targets: Float32Array; n: number; epochs: number };

const ready = initQuadrupedPhysics();
const teacher = new QuadrupedTeacher({ horizon: 10 });
let member: { ensemble: Ensemble; k: number } | null = null;
const ensembles = new Map<string, Ensemble>();

function driverOf(d: Driver): (env: QuadrupedEnv) => ArrayLike<number> {
  if (d === 'base') return () => CANDIDATES[0];
  if (d === 'planner') return (env) => teacher.targetAction(env).action;
  if (!ensembles.has(d.key)) ensembles.set(d.key, importEnsemble(d.model));
  const e = ensembles.get(d.key)!;
  return (env) => e.decide(env.encode()).action;
}

parentPort!.on('message', async (task: WorkerTask) => {
  try {
    await ready;
    if (task.type === 'collect') {
      // Every visited state labelled by the planner; the driver chooses the action actually played.
      const drive = task.driver === 'planner' ? null : driverOf(task.driver);
      const env = new QuadrupedEnv({ pushImpulse: task.J });
      env.reset(task.seed);
      const xs: number[] = [];
      const ys: number[] = [];
      while (!env.isDone()) {
        const label = teacher.targetAction(env).action;
        const x = env.encode();
        xs.push(...x);
        ys.push(...label);
        env.advance(drive ? drive(env) : label);
      }
      env.dispose();
      const X = Float32Array.from(xs);
      const Y = Float64Array.from(ys);
      parentPort!.postMessage({ id: task.id, xs: X, ys: Y }, [X.buffer, Y.buffer]);
    } else if (task.type === 'play') {
      const drive = driverOf(task.driver);
      const env = new QuadrupedEnv({ pushImpulse: task.J });
      env.reset(task.seed);
      while (!env.isDone()) env.advance(drive(env));
      const result = { fell: env.end === 'fall', distance: env.score(), time: env.time };
      env.dispose();
      parentPort!.postMessage({ id: task.id, result });
    } else if (task.type === 'member-init') {
      member = { ensemble: new Ensemble(task.config), k: task.k };
      parentPort!.postMessage({ id: task.id });
    } else {
      const { ensemble, k } = member!;
      const dim = ensemble.dim;
      const inputs = ensemble.config.inputSize;
      const xs = Array.from({ length: task.n }, (_, i) => task.xs.subarray(i * inputs, (i + 1) * inputs));
      const targets = Array.from({ length: task.n }, (_, i) => task.targets.subarray(i * dim, (i + 1) * dim));
      ensemble.trainMember(k, xs, targets, task.epochs);
      const params = Float32Array.from(ensemble.members[k].params);
      parentPort!.postMessage({ id: task.id, params }, [params.buffer]);
    }
  } catch (err) {
    parentPort!.postMessage({ id: task.id, error: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
});
