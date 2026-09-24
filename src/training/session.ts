import type { LogEntry } from './pipeline';

/** What runSession needs from a pipeline (discrete or continuous). */
export interface SteppablePipeline<P> {
  readonly config: { iterations: number };
  readonly log: LogEntry[];
  bootstrap(): LogEntry;
  escalationIteration(): LogEntry;
  consolidate(meta?: Record<string, unknown>): P;
  snapshot(): P;
}

export interface SessionHooks<P> {
  /** Checked between steps; returning true ends the session after the current step. */
  shouldStop(): boolean;
  /** Called after every step with its log entry and the current weights. */
  onStep(entry: LogEntry, policy: P): void;
  /** Awaited between steps so the host (e.g. a Web Worker) can process messages. */
  yieldControl(): Promise<void>;
}

export interface SessionResult<P> {
  /** Final weights: consolidated if the session completed, the last snapshot if stopped. */
  policy: P;
  completed: boolean;
}

/**
 * Runs the same steps as `TrainingPipeline.run()` in the same order, one at a
 * time, reporting after each and yielding in between. A completed session
 * therefore produces the same weights as `run()`.
 */
export async function runSession<P>(
  pipeline: SteppablePipeline<P>,
  hooks: SessionHooks<P>,
  meta: Record<string, unknown> = {},
): Promise<SessionResult<P>> {
  hooks.onStep(pipeline.bootstrap(), pipeline.snapshot());
  await hooks.yieldControl();
  for (let i = 0; i < pipeline.config.iterations; i++) {
    if (hooks.shouldStop()) return { policy: pipeline.snapshot(), completed: false };
    hooks.onStep(pipeline.escalationIteration(), pipeline.snapshot());
    await hooks.yieldControl();
  }
  if (hooks.shouldStop()) return { policy: pipeline.snapshot(), completed: false };
  const policy = pipeline.consolidate(meta);
  hooks.onStep(pipeline.log[pipeline.log.length - 1], policy);
  return { policy, completed: true };
}
