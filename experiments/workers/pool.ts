/** A thread pool with a shared queue for experiment workers: each task goes to the next free worker; replies come back by id. */
import { Worker } from 'node:worker_threads';

export type Reply = { id: number; error?: string; [k: string]: unknown };

export class Pool<Task extends { id: number }> {
  private readonly workers: Worker[];
  private readonly idle: Worker[] = [];
  private readonly queue: Array<{ task: Task; resolve: (r: Reply) => void; reject: (e: Error) => void }> = [];
  private readonly pending = new Map<number, { worker: Worker; resolve: (r: Reply) => void; reject: (e: Error) => void }>();
  private nextId = 0;

  /** `entry`: URL of the TypeScript worker module, loaded through the tsx bootstrap. */
  constructor(entry: URL, size: number) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./bootstrap.mjs', import.meta.url), { workerData: { entry: entry.href } });
      w.on('message', (r: Reply) => {
        const p = this.pending.get(r.id)!;
        this.pending.delete(r.id);
        this.idle.push(p.worker);
        if (r.error) p.reject(new Error(r.error));
        else p.resolve(r);
        this.pump();
      });
      this.idle.push(w);
      return w;
    });
  }

  /** Queues a task; `urgent` tasks go ahead of the queued ones (e.g. training ahead of evaluation). */
  run(task: Omit<Task, 'id'>, urgent = false): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const entry = { task: { ...task, id: this.nextId++ } as Task, resolve, reject };
      if (urgent) this.queue.unshift(entry);
      else this.queue.push(entry);
      this.pump();
    });
  }

  /** Sends a task to one specific worker (for workers that keep state, like ensemble members). */
  runOn(i: number, task: Omit<Task, 'id'>, transfer: ArrayBuffer[] = []): Promise<Reply> {
    const worker = this.workers[i];
    const slot = this.idle.indexOf(worker);
    if (slot < 0) return Promise.reject(new Error(`Worker ${i} is busy: runOn needs it idle`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { worker, resolve, reject });
      this.idle.splice(slot, 1);
      worker.postMessage({ ...task, id }, transfer);
    });
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!;
      const { task, resolve, reject } = this.queue.shift()!;
      this.pending.set(task.id, { worker: w, resolve, reject });
      w.postMessage(task);
    }
  }

  close(): Promise<number[]> {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}
