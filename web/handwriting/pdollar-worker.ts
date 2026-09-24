/// <reference lib="webworker" />
/**
 * Runs the $P recogniser off the main thread: it compares each letter with 1,560 templates
 * (tens of milliseconds), so the pad stays responsive. Templates are the training writers'
 * samples, unchanged, so this $P gives the same answers as the study's.
 */
import { PDollarRecognizer } from '../../src/handwriting/pdollar';

export type PDollarRequest = { type: 'init'; url: string } | { type: 'recognize'; id: number; strokes: number[][] };
export type PDollarResponse =
  | { type: 'ready'; templates: number }
  | { type: 'result'; id: number; top: Array<{ label: number; score: number }>; cost: number; ms: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ready: Promise<PDollarRecognizer> | null = null;

ctx.onmessage = async (e: MessageEvent<PDollarRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      ready = fetch(msg.url)
        .then((r) => {
          if (!r.ok) throw new Error(`templates: HTTP ${r.status}`);
          return r.json() as Promise<{ samples: Array<{ l: number; s: number[][] }> }>;
        })
        .then((data) => PDollarRecognizer.fromSamples(data.samples.map((s) => ({ writer: '', label: s.l, strokes: s.s }))));
      const rec = await ready;
      ctx.postMessage({ type: 'ready', templates: rec.templates.length } satisfies PDollarResponse);
      return;
    }
    if (!ready) throw new Error('not initialised');
    const rec = await ready;
    const t0 = performance.now();
    const r = rec.recognize(msg.strokes, 3);
    ctx.postMessage({ type: 'result', id: msg.id, top: r.top, cost: r.cost, ms: performance.now() - t0 } satisfies PDollarResponse);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: String(err) } satisfies PDollarResponse);
  }
};
