import type { EvalReport } from '../src/eval/report';
import { SNAKE_ACTIONS, SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';
import { HybridPlayer, NetStudent } from '../src/hybrid';
import { Mlp, importPolicy, type SerializedPolicy } from '../src/nn';
import type { LogEntry } from '../src/training/pipeline';
import { argmax } from '../src/core/types';
import { drawBars } from './bars';
import { cssVar, drawLines, drawScatter, formatTick, type ScatterLayout, type ScatterPoint } from './charts';
import { costDomain, frontierPoints, type FrontierPoint } from './frontier';
import { GameView, decisionState, type DecisionState } from './game-view';
import type { FromWorker, ToWorker } from './protocol';
import { CanvasRecorder, download } from './recorder';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ——— Elements ———
const boardCanvas = $<HTMLCanvasElement>('board');
const barsCanvas = $<HTMLCanvasElement>('bars');
const shareCanvas = $<HTMLCanvasElement>('chart-share');
const scoreCanvas = $<HTMLCanvasElement>('chart-score');
const frontierCanvas = $<HTMLCanvasElement>('frontier');
const tip = $<HTMLDivElement>('tip');
const thresholdInput = $<HTMLInputElement>('threshold');
const speedInput = $<HTMLInputElement>('speed');
const guardInput = $<HTMLInputElement>('guard');
const seedInput = $<HTMLInputElement>('seed');
const btnPretrained = $<HTMLButtonElement>('btn-pretrained');
const btnTrain = $<HTMLButtonElement>('btn-train');
const btnRecord = $<HTMLButtonElement>('btn-record');
const btnPause = $<HTMLButtonElement>('btn-pause');

// ——— Model and players ———
const teacher = new SnakeTeacher({ depth: 1 });
const guard = new SnakeGuard();
let student = new NetStudent(new Mlp({ inputSize: 201, hidden: [64, 64], outputSize: 3, seed: 20260923 }), 1, 'maxProb');
let hybrid!: HybridPlayer;
let threshold = Number(thresholdInput.value);
let guardOn = guardInput.checked;

function rebuildHybrid(): void {
  hybrid = new HybridPlayer(student, teacher, { threshold, auditRate: 0 }, guardOn ? guard : undefined);
}
rebuildHybrid();

function applyPolicy(policy: SerializedPolicy, source: string): void {
  const { net, calibrationT } = importPolicy(policy);
  student = new NetStudent(net, calibrationT, 'maxProb');
  rebuildHybrid();
  const kb = (JSON.stringify(policy).length / 1024).toFixed(1);
  $('model-info').textContent = `Model: ${source} · ${net.numParams.toLocaleString('en-US')} params · ${kb} KB · T=${calibrationT.toFixed(2)}`;
}

// ——— Game state ———
const view = new GameView(boardCanvas);
const env = new SnakeEnv();
let seed = Number(seedInput.value) || 1;
let episode = 1;
const episodeScores: number[] = [];
let lastState: DecisionState = 'system1';
let lastProbs: Float32Array | null = null;
let lastChoice = 0;
let lastPlayed = 0;

const WINDOW = 1000;
const winState = new Uint8Array(WINDOW); // 0 system1, 1 guard, 2 system2
const winCost = new Float64Array(WINDOW);
let winCount = 0;
let winPtr = 0;
const STATE_CODE: Record<DecisionState, number> = { system1: 0, guard: 1, system2: 2 };

function resetGame(newSeed: number): void {
  seed = newSeed;
  episode = 1;
  episodeScores.length = 0;
  env.reset(seed);
  view.reset();
}
resetGame(seed);

function playMove(): void {
  if (env.isDone()) {
    episodeScores.push(env.score());
    if (episodeScores.length > 50) episodeScores.shift();
    episode++;
    env.reset(seed + episode - 1);
    view.reset();
  }
  const m = hybrid.act(env);
  lastState = decisionState(m.decider, m.escalationReason);
  lastProbs = m.probs ?? null;
  lastChoice = lastProbs ? argmax(lastProbs) : m.action;
  lastPlayed = m.action;
  winState[winPtr] = STATE_CODE[lastState];
  winCost[winPtr] = m.cost;
  winPtr = (winPtr + 1) % WINDOW;
  winCount = Math.min(winCount + 1, WINDOW);
  env.step(m.action);
  view.record(env, lastState);
  movesThisSecond++;
}

// ——— Loop ———
let paused = false;
let acc = 0;
let lastFrame = performance.now();
let movesThisSecond = 0;
let secondStart = performance.now();
let actualSpeed = 0;
let lastDomUpdate = 0;

const speedFromSlider = (v: number) => Math.round(5 * 400 ** v); // 5 … 2000 moves/s

function frame(now: number): void {
  const dt = Math.min(100, now - lastFrame);
  lastFrame = now;
  if (!paused) {
    acc += (dt * speedFromSlider(Number(speedInput.value))) / 1000;
    const budgetEnd = now + 10; // keep rendering smooth: at most ~10 ms of moves per frame
    while (acc >= 1 && performance.now() < budgetEnd) {
      playMove();
      acc -= 1;
    }
    if (acc > 50) acc = 50; // do not accumulate an unbounded backlog
  }
  if (now - secondStart >= 1000) {
    actualSpeed = (movesThisSecond * 1000) / (now - secondStart);
    movesThisSecond = 0;
    secondStart = now;
  }
  view.draw(env, lastState);
  drawBars(barsCanvas, SNAKE_ACTIONS, lastProbs, lastChoice, lastPlayed, threshold);
  if (now - lastDomUpdate > 120) {
    updateReadouts();
    lastDomUpdate = now;
  }
  requestAnimationFrame(frame);
}

const STATE_LABEL: Record<DecisionState, string> = {
  system1: 'System One decided',
  guard: 'Guard stopped System One',
  system2: 'System Two decided',
};
const STATE_VAR: Record<DecisionState, string> = { system1: '--s1', guard: '--guard', system2: '--s2' };

function updateReadouts(): void {
  $('r-score').textContent = String(env.score());
  $('r-episode').textContent = String(episode);
  const recent = episodeScores.slice(-10);
  $('r-avg').textContent = recent.length ? (recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(0) : '–';
  $('r-speed').textContent = paused ? 'paused' : actualSpeed ? actualSpeed.toFixed(0) : '–';
  $('now-label').textContent = STATE_LABEL[lastState];
  $('now-dot').style.background = cssVar(document.documentElement, STATE_VAR[lastState]);

  if (winCount) {
    const counts = [0, 0, 0];
    let cost = 0;
    for (let i = 0; i < winCount; i++) {
      counts[winState[i]]++;
      cost += winCost[i];
    }
    const pct = (c: number) => `${((100 * c) / winCount).toFixed(winCount >= 100 ? 1 : 0)}%`;
    $('t-system1').textContent = pct(counts[0]);
    $('t-guard').textContent = pct(counts[1]);
    $('t-system2').textContent = pct(counts[2]);
    const perMove = cost / winCount;
    $('cost-value').textContent = perMove >= 100 ? perMove.toFixed(0) : perMove.toFixed(1);
  }
}

// ——— Controls ———
function syncOutputs(): void {
  $('o-threshold').textContent = threshold.toFixed(2);
  $('o-speed').textContent = String(speedFromSlider(Number(speedInput.value)));
}
thresholdInput.addEventListener('input', () => {
  threshold = Number(thresholdInput.value);
  rebuildHybrid();
  syncOutputs();
});
speedInput.addEventListener('input', syncOutputs);
guardInput.addEventListener('change', () => {
  guardOn = guardInput.checked;
  rebuildHybrid();
});
seedInput.addEventListener('change', () => resetGame(Math.max(1, Math.floor(Number(seedInput.value)) || 1)));
btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? 'Resume' : 'Pause';
});
syncOutputs();

btnPretrained.addEventListener('click', async () => {
  btnPretrained.disabled = true;
  try {
    const res = await fetch('./data/snake-weights.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    applyPolicy((await res.json()) as SerializedPolicy, 'pretrained');
  } catch (err) {
    $('model-info').textContent = `Could not load the pretrained weights: ${String(err)}`;
  } finally {
    btnPretrained.disabled = training;
  }
});

// ——— Training worker ———
let worker: Worker | null = null;
let training = false;
const log: LogEntry[] = [];

function setTraining(on: boolean): void {
  training = on;
  btnTrain.textContent = on ? 'Stop training' : 'Train in this tab';
  btnTrain.setAttribute('aria-pressed', String(on));
  btnTrain.disabled = false;
  btnPretrained.disabled = on;
}

function describe(e: LogEntry): string {
  const it = e.phase === 'escalation' ? `iteration ${e.iteration}/30` : e.phase;
  const score = e.meanScore === null ? '' : ` · mean score ${e.meanScore.toFixed(0)}`;
  return `${it} · escalated ${(e.escalationRate * 100).toFixed(1)}% (guard ${(e.guardEscalationRate * 100).toFixed(1)}%) · agreement ${(e.valAgreement * 100).toFixed(1)}%${score} · ${e.datasetSize.toLocaleString('en-US')} examples · ${(e.elapsedMs / 1000).toFixed(0)} s`;
}

btnTrain.addEventListener('click', () => {
  if (training) {
    worker?.postMessage({ type: 'stop' } satisfies ToWorker);
    btnTrain.textContent = 'Stopping…';
    btnTrain.disabled = true;
    return;
  }
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    if (msg.type === 'progress') {
      log.push(msg.entry);
      applyPolicy(msg.policy, `trained in this tab · ${msg.entry.phase} ${msg.entry.iteration}`);
      $('train-status').textContent = describe(msg.entry);
      drawCurves();
    } else if (msg.type === 'done') {
      applyPolicy(msg.policy, msg.completed ? 'trained in this tab · final' : 'trained in this tab · stopped early');
      $('train-status').textContent = `${msg.completed ? 'Done' : 'Stopped'} · ${log.length ? describe(log[log.length - 1]) : ''}`;
      setTraining(false);
    } else {
      $('train-status').textContent = `Training failed: ${msg.message}`;
      setTraining(false);
    }
  };
  worker.onerror = (e) => {
    $('train-status').textContent = `Worker error: ${e.message}`;
    setTraining(false);
  };
  log.length = 0;
  drawCurves();
  $('train-status').textContent = 'Bootstrap: the planner plays 5 games to create the first labels…';
  worker.postMessage({ type: 'start', config: {} } satisfies ToWorker);
  setTraining(true);
});

function drawCurves(): void {
  const root = document.documentElement;
  drawLines(
    shareCanvas,
    [
      { label: 'escalated', color: cssVar(root, '--s2'), values: log.map((e) => e.escalationRate) },
      { label: 'guard', color: cssVar(root, '--guard'), values: log.map((e) => e.guardEscalationRate), dashed: true },
      { label: 'agreement', color: cssVar(root, '--ink-2'), values: log.map((e) => e.valAgreement) },
    ],
    1,
    (v) => `${Math.round(v * 100)}%`,
  );
  drawLines(scoreCanvas, [{ label: 'score', color: cssVar(root, '--s1'), values: log.map((e) => e.meanScore) }], 400, (v) => String(v));
}

// ——— Recorder ———
const recorder = new CanvasRecorder(boardCanvas);
if (!recorder.available) {
  btnRecord.disabled = true;
  $('rec-hint').textContent = 'Video recording is not supported in this browser.';
}
btnRecord.addEventListener('click', async () => {
  if (!recorder.recording) {
    recorder.start();
    btnRecord.textContent = 'Stop & save';
    btnRecord.setAttribute('aria-pressed', 'true');
    $('rec-badge').hidden = false;
    return;
  }
  const { blob, filename } = await recorder.stop();
  btnRecord.textContent = 'Record clip';
  btnRecord.setAttribute('aria-pressed', 'false');
  $('rec-badge').hidden = true;
  download(blob, filename);
  $('rec-hint').textContent = `Saved ${filename} (${(blob.size / 1024).toFixed(0)} KB).`;
});

// ——— Frontier ———
let frontier: FrontierPoint[] = [];
let layout: ScatterLayout | null = null;

function livePoint(): FrontierPoint | null {
  if (episodeScores.length < 3 || !winCount) return null;
  let cost = 0;
  for (let i = 0; i < winCount; i++) cost += winCost[i];
  const recent = episodeScores.slice(-10);
  return {
    label: `live game (last ${recent.length} episodes)`,
    kind: 'other',
    cost: cost / winCount,
    score: recent.reduce((a, b) => a + b, 0) / recent.length,
    ci95: 0,
    zeroCost: false,
  };
}

function drawFrontier(): void {
  if (!frontier.length) return;
  const root = document.documentElement;
  const color = { system2: cssVar(root, '--s2'), hybrid: cssVar(root, '--ink-3'), 'hybrid+guard': cssVar(root, '--s1'), other: cssVar(root, '--ink-3') };
  const shape = { system2: 'square', hybrid: 'ring', 'hybrid+guard': 'circle', other: 'diamond' } as const;
  const domain = costDomain(frontier);
  const points: ScatterPoint[] = frontier.map((p) => ({ x: p.zeroCost ? domain[0] : p.cost, y: p.score, shape: shape[p.kind], color: color[p.kind], label: pointLabel(p) }));
  const live = livePoint();
  if (live) points.push({ x: Math.min(Math.max(live.cost, domain[0]), domain[1]), y: live.score, shape: 'ring', color: cssVar(root, '--here'), label: pointLabel(live), highlight: true });
  const reference = frontier.find((p) => p.label === 'system2 (level 1)');
  layout = drawScatter(frontierCanvas, points, domain, [0, 400], 'compute units per move (log)', 'mean score', (ctx, x, y) => {
    if (!reference) return;
    // H2 target region: at least 90% of the planner's score for at most a tenth of its cost.
    const x0 = x(domain[0]);
    const x1 = x(reference.cost / 10);
    const y0 = y(400);
    const y1 = y(reference.score * 0.9);
    ctx.fillStyle = cssVar(root, '--s1');
    ctx.globalAlpha = 0.09;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar(root, '--ink-3');
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('target', x0 + 4, y0 + 4);
  });
}

function pointLabel(p: FrontierPoint): string {
  const cost = p.zeroCost ? '0' : formatTick(Number(p.cost.toFixed(1)));
  return `${p.label} · score ${p.score.toFixed(1)}${p.ci95 ? ` ±${p.ci95.toFixed(1)}` : ''} · ${cost} units/move`;
}

function showTip(clientX: number, clientY: number): void {
  if (!layout) return;
  const rect = frontierCanvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  let best: ScatterLayout['positions'][number] | null = null;
  let bestD = 14 * 14;
  for (const pos of layout.positions) {
    const d = (pos.px - mx) ** 2 + (pos.py - my) ** 2;
    if (d < bestD) {
      bestD = d;
      best = pos;
    }
  }
  if (!best) {
    tip.hidden = true;
    return;
  }
  tip.textContent = best.point.label;
  tip.hidden = false;
  tip.style.left = `${Math.min(Math.max(best.px, 90), rect.width - 90)}px`;
  tip.style.top = `${best.py}px`;
}
frontierCanvas.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY));
frontierCanvas.addEventListener('pointerdown', (e) => showTip(e.clientX, e.clientY));
frontierCanvas.addEventListener('pointerleave', () => (tip.hidden = true));

fetch('./data/snake-eval-report.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((report: EvalReport) => {
    frontier = frontierPoints(report);
    drawFrontier();
  })
  .catch((err) => {
    $('frontier-title').insertAdjacentHTML('afterend', `<p class="sub">Could not load the evaluation report: ${String(err)}</p>`);
  });
setInterval(drawFrontier, 1000);

// ——— Theme and resize ———
$('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  drawCurves();
  drawFrontier();
});
new ResizeObserver(() => {
  drawCurves();
  drawFrontier();
}).observe(document.body);

drawCurves();
requestAnimationFrame(frame);
