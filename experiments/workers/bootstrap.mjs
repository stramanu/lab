// Worker threads do not inherit tsx's loader: register it here, then load the TypeScript worker.
import { register } from 'tsx/esm/api';
import { workerData } from 'node:worker_threads';

register();
await import(workerData.entry);
