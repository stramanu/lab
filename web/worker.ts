/// <reference lib="webworker" />
import { SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';
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
    const pipeline = new TrainingPipeline(
      { name: 'snake', makeEnv: () => new SnakeEnv(), teacher: new SnakeTeacher({ depth: 1 }), guard: new SnakeGuard() },
      msg.config,
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
