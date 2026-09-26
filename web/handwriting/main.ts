import { LETTERS } from '../../src/handwriting/data';
import { MlpRecognizer, type Candidate } from '../../src/handwriting/recognizer';
import type { SerializedPolicy } from '../../src/nn/serialize';
import type { InputLayout } from '../games';
import { NetworkView } from '../network-view';
import { initNetworkSplit } from '../network-split';
import { initTheme } from '../theme';
import { Pad } from './pad';
import type { PDollarRequest, PDollarResponse } from './pdollar-worker';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const data = (file: string) => new URL(`../data/${file}`, location.href).href;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en');
const fmtOps = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : fmtInt(n));
const fmtMs = (ms: number) => (ms < 0.1 ? '< 0.1 ms' : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`);
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;

/** The raster input as the 3D view's window layout: 16×16 cells shaded by ink coverage. */
const LAYOUT: InputLayout = { kind: 'window', side: 16, channels: 1, extras: 0, channelVars: ['--s1'], emptyVar: '--panel-edge', graded: true };

let model: MlpRecognizer | null = null;
let network: NetworkView | null = null;
let text = '';
let lastAlternatives: Candidate[] = [];
let requestId = 0;
let mlpOps = 0;

// ——— Theme ———
initTheme();
initNetworkSplit(document.querySelector<HTMLElement>('.hw-layout')!, document.getElementById('split-toggle') as HTMLButtonElement);

// ——— Display ———
function renderText(): void {
  $('text').textContent = text.replace(/ /g, ' ');
  const line = $('text').parentElement!;
  line.scrollLeft = line.scrollWidth;
}

function renderChips(chosen: number): void {
  const chips = $('chips');
  chips.replaceChildren(
    ...lastAlternatives.slice(0, 3).map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<b>${LETTERS[c.label]}</b>${c.score.toFixed(2)}`;
      b.setAttribute('aria-pressed', String(c.label === chosen));
      b.setAttribute('aria-label', `Use ${LETTERS[c.label]} (probability ${c.score.toFixed(2)})`);
      b.addEventListener('click', () => {
        if (!text.length) return;
        text = text.slice(0, -1) + LETTERS[c.label];
        renderText();
        renderChips(c.label);
      });
      return b;
    }),
  );
}

$('k-space').addEventListener('click', () => {
  text += ' ';
  lastAlternatives = [];
  renderText();
  renderChips(-1);
});
$('k-back').addEventListener('click', () => {
  text = text.slice(0, -1);
  lastAlternatives = [];
  renderText();
  renderChips(-1);
});
$('k-clear').addEventListener('click', () => {
  text = '';
  lastAlternatives = [];
  pad.reset();
  renderText();
  renderChips(-1);
});

// ——— $P in a worker ———
const worker = new Worker(new URL('./pdollar-worker.ts', import.meta.url), { type: 'module' });
worker.postMessage({ type: 'init', url: data('handwriting-templates.json') } satisfies PDollarRequest);
let pdTemplates = 0;
let lastMlpLabel = -1;

worker.onmessage = (e: MessageEvent<PDollarResponse>) => {
  const msg = e.data;
  if (msg.type === 'ready') {
    pdTemplates = msg.templates;
    $('pd-meta').textContent = `${fmtInt(msg.templates)} stored examples`;
    return;
  }
  if (msg.type === 'error') {
    $('pd-meta').textContent = `unavailable (${msg.message})`;
    return;
  }
  if (msg.id !== requestId) return; // a newer letter is already on its way
  $('pd-list').replaceChildren(
    ...msg.top.map((c) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${LETTERS[c.label]}</b><span class="dist">distance ${c.score.toFixed(2)}</span><span></span>`;
      return li;
    }),
  );
  $('pd-cost').textContent = `${fmtOps(msg.cost)} operations · ${fmtMs(msg.ms)} in this browser`;
  const pdLabel = msg.top[0].label;
  const verdict = $('verdict');
  verdict.hidden = false;
  verdict.dataset.agree = String(pdLabel === lastMlpLabel);
  verdict.textContent =
    pdLabel === lastMlpLabel
      ? `Both read ${LETTERS[pdLabel]}. The network needed ${Math.round(msg.cost / mlpOps).toLocaleString('en')}× less arithmetic.`
      : `They disagree: the network read ${LETTERS[lastMlpLabel]}, $P read ${LETTERS[pdLabel]}.`;
  const maxLog = Math.log10(msg.cost);
  $('work').hidden = false;
  $('w-mlp').style.width = `${(100 * Math.log10(mlpOps)) / maxLog}%`;
  $('w-pd').style.width = '100%';
  $('w-mlp-v').textContent = fmtOps(mlpOps);
  $('w-pd-v').textContent = fmtOps(msg.cost);
};

// ——— Recognition ———
function recognize(strokes: number[][]): void {
  if (!model) return;
  const t0 = performance.now();
  const r = model.recognize(strokes, 5);
  const ms = performance.now() - t0;
  mlpOps = r.cost;
  lastMlpLabel = r.top[0].label;

  text += LETTERS[r.top[0].label];
  lastAlternatives = r.top;
  renderText();
  renderChips(r.top[0].label);

  $('mlp-list').replaceChildren(
    ...r.top.map((c) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${LETTERS[c.label]}</b><span class="bar"><i style="width:${(100 * c.score).toFixed(1)}%"></i></span><span>${pct(c.score)}</span>`;
      return li;
    }),
  );
  $('mlp-cost').textContent = `${fmtInt(r.cost)} operations · ${fmtMs(ms)} in this browser`;

  const glass = $('glass');
  glass.classList.add('read');
  window.setTimeout(() => glass.classList.remove('read'), 500);

  requestId++;
  $('pd-list').replaceChildren();
  $('pd-cost').textContent = pdTemplates ? `comparing with ${fmtInt(pdTemplates)} stored examples…` : 'loading templates…';
  $('verdict').hidden = true;
  worker.postMessage({ type: 'recognize', id: requestId, strokes } satisfies PDollarRequest);

  if (network) {
    const x = model.input(strokes);
    const probs = model.net.probs(x, null, model.temperature);
    network.update({ trace: model.net.trace(x), probs, chosen: r.top[0].label, threshold: 0, deciderVar: '--s1' }, LAYOUT);
  }
}

const pad = new Pad($('pad') as HTMLCanvasElement, recognize, () => ($('pad-hint').dataset.off = 'true'));

// ——— Model and 3D view ———
async function loadModel(): Promise<void> {
  const res = await fetch(data('handwriting-weights.json'));
  if (!res.ok) throw new Error(`weights: HTTP ${res.status}`);
  model = MlpRecognizer.import((await res.json()) as SerializedPolicy);
  $('mlp-meta').textContent = `${fmtInt(model.net.numParams)} parameters · T = ${model.temperature.toFixed(2)}`;
  $('mlp-list').innerHTML = '<li class="empty">Draw a letter on the pad.</li>';
  network = await NetworkView.create($('network'));
  if (network) {
    network.setModel(model.net, LAYOUT, LETTERS.split(''));
    const blank = new Float32Array(model.net.config.inputSize);
    network.update({ trace: model.net.trace(blank), probs: model.net.probs(blank, null, model.temperature), chosen: -1, threshold: 0, deciderVar: '--s1' }, LAYOUT);
  }
}

// ——— Published study ———
interface HandwritingStudy {
  data: { testWriters: number; testSamples: number; trainWriters: number };
  runs: unknown[];
  mlp: { top1: { mean: number; ci95: number }; top3: { mean: number }; eceBefore: { mean: number }; eceAfter: { mean: number }; cost: number; topConfusions: Array<{ truth: string; predicted: string; count: number }> };
  pdollar: { top1: number; top3: number; cost: number };
  costRatio: number;
  targets: Array<{ id: string; statement: string; target: string; measured: string; confirmed: boolean; runsConfirmed: string }>;
}

async function loadStudy(): Promise<void> {
  const res = await fetch(data('handwriting-study.json'));
  if (!res.ok) throw new Error(`study: HTTP ${res.status}`);
  const s = (await res.json()) as HandwritingStudy;
  const runs = s.runs.length;
  $('study-sub').textContent = `On ${s.data.testWriters} writers the network never saw (${fmtInt(s.data.testSamples)} letters), mean of ${runs} training runs with 95% intervals. Targets were fixed before measuring.`;
  const table = $('study-table');
  table.querySelector('tbody')!.innerHTML = `
    <tr><td>Network (MLP)</td><td>${pct(s.mlp.top1.mean)} ± ${(100 * s.mlp.top1.ci95).toFixed(1)}</td><td>${pct(s.mlp.top3.mean)}</td><td>${fmtInt(s.mlp.cost)}</td></tr>
    <tr><td>$P</td><td>${pct(s.pdollar.top1)}</td><td>${pct(s.pdollar.top3)}</td><td>${fmtInt(s.pdollar.cost)}</td></tr>`;
  table.hidden = false;
  $('targets').replaceChildren(
    ...s.targets.map((t) => {
      const li = document.createElement('li');
      li.dataset.ok = String(t.confirmed);
      li.textContent = `${t.id} ${t.confirmed ? '✓' : '✗'} ${t.statement}: ${t.measured} (target ${t.target}; ${t.runsConfirmed} runs)`;
      return li;
    }),
  );
  const per = runs * (s.data.testSamples / LETTERS.length);
  $('confusions').textContent = `Most frequent mistakes of the network: ${s.mlp.topConfusions
    .slice(0, 5)
    .map((c) => `${c.truth} read as ${c.predicted} (${Math.round((100 * c.count) / per)}% of ${c.truth}s)`)
    .join(', ')}. Calibration error (ECE) ${s.mlp.eceBefore.mean.toFixed(3)} → ${s.mlp.eceAfter.mean.toFixed(3)} after temperature scaling.`;
}

loadModel().catch((err) => ($('mlp-meta').textContent = `unavailable (${String(err)})`));
loadStudy().catch((err) => ($('study-sub').textContent = `Results unavailable (${String(err)}).`));
renderText();
