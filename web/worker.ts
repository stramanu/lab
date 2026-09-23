/// <reference lib="webworker" />
import { getGame } from '../src/games/registry';
import { TrainingPipeline, runSession } from '../src/training';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let stopRequested = false;
let running = false;
const post = (msg: FromWorker) => self.postMessage(msg);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'stop') {
    stopRequested = true;
    return;
  }
  if (running) return;
  running = true;
  stopRequested = false;
  try {
    const game = getGame(msg.game);
    const pipeline = new TrainingPipeline(
      { name: game.name, makeEnv: game.makeEnv, teacher: game.makeTeacher(game.referenceLevel), guard: game.makeGuard() },
      { ...game.pipeline, ...msg.config },
    );
    const result = await runSession(pipeline, {
      shouldStop: () => stopRequested,
      onStep: (entry, policy) => post({ type: 'progress', entry, policy }),
      // A macrotask boundary lets queued 'stop' messages run between steps.
      yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    post({ type: 'done', policy: result.policy, completed: result.completed });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
};
