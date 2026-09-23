import type { SerializedPolicy } from '../src/nn/serialize';
import type { LogEntry, PipelineConfig } from '../src/training/pipeline';

/** Page → worker. */
export type ToWorker = { type: 'start'; game: string; config: Partial<PipelineConfig> } | { type: 'stop' };

/** Worker → page. */
export type FromWorker =
  | { type: 'progress'; entry: LogEntry; policy: SerializedPolicy }
  | { type: 'done'; policy: SerializedPolicy; completed: boolean }
  | { type: 'error'; message: string };
