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

  run(task: Omit<Task, 'id'>): Promise<Reply> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task: { ...task, id: this.nextId++ } as Task, resolve, reject });
      this.pump();
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
