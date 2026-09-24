import type { SerializedEnsemble } from '../src/nn/ensemble';
import type { SerializedPolicy } from '../src/nn/serialize';

/** Discrete games ship a policy, continuous games an ensemble. */
export type Weights = SerializedPolicy | SerializedEnsemble;
import type { LogEntry, PipelineConfig } from '../src/training/pipeline';

/** Page → worker. */
export type ToWorker = { type: 'start'; game: string; config: Partial<PipelineConfig> } | { type: 'stop' };

/** Worker → page. */
export type FromWorker =
  | { type: 'progress'; entry: LogEntry; policy: Weights }
  | { type: 'done'; policy: Weights; completed: boolean }
  | { type: 'error'; message: string };
