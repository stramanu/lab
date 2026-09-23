import { argmax, type Env } from '../src/core/types';
import { HybridPlayer, NetStudent } from '../src/hybrid';
import { Mlp, importPolicy, type SerializedPolicy } from '../src/nn';
import type { LogEntry } from '../src/training/pipeline';
import { drawBars } from './bars';
import { cssVar, drawLines, drawScatter, formatTick, type ScatterLayout, type ScatterPoint } from './charts';
import { costDomain, frontierPoints, referencePoint, scoreDomain, type FrontierPoint, type StudyFile } from './frontier';
import { STATE_VAR, decisionState, type BoardView, type DecisionState } from './game-view';
import { DEMO_GAMES, demoGame, type DemoGame } from './games';
import type { NetworkView } from './network-view';
import type { FromWorker, ToWorker } from './protocol';
import { CanvasRecorder, download } from './recorder';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = document.documentElement;

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

// ——— Per-game state ———
let game: DemoGame = DEMO_GAMES[0];
let env: Env = game.def.makeEnv();
let view: BoardView = game.createView(boardCanvas);
let student!: NetStudent;
let hybrid!: HybridPlayer;
let threshold = Number(thresholdInput.value);
let guardOn = guardInput.checked;

function rebuildHybrid(): void {
  hybrid = new HybridPlayer(student, game.def.makeTeacher(game.def.referenceLevel), { threshold, auditRate: 0 }, guardOn ? game.def.makeGuard() : undefined);
}

function untrainedNet(): Mlp {
  return new Mlp({ inputSize: env.encodingSize, hidden: [64, 64], outputSize: env.numActions, seed: 20260923 });
}

function setModel(net: Mlp, temperature: number, info: string): void {
  student = new NetStudent(net, temperature, 'maxProb');
  rebuildHybrid();
  $('model-info').textContent = info;
  network?.setModel(net, game.input, env.actionNames);
}

function applyPolicy(policy: SerializedPolicy, source: string): void {
  const { net, calibrationT } = importPolicy(policy);
  const kb = (JSON.stringify(policy).length / 1024).toFixed(1);
  setModel(net, calibrationT, `Model: ${source} · ${net.numParams.toLocaleString('en-US')} params · ${kb} KB · T=${calibrationT.toFixed(2)}`);
}

// ——— Live play ———
let seed = Number(seedInput.value) || 1;
let episode = 1;
const episodeScores: number[] = [];
let lastState: DecisionState = 'system1';
let lastProbs: Float32Array | null = null;
let lastChoice = 0;
let lastPlayed = 0;
let lastEncoding: Float32Array | null = null;

/**
 * The decision shown by the bars and the 3D view. It is refreshed at most every
 * 80 ms from the latest move, so both panels always show the same decision.
 */
let shown: { probs: Float32Array; encoding: Float32Array; chosen: number; played: number; state: DecisionState } | null = null;
let lastShown = 0;

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
  winCount = 0;
  winPtr = 0;
  env.reset(seed);
  view.reset();
  lastProbs = null;
  shown = null;
}

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
  lastEncoding = m.state ?? null;
  lastChoice = lastProbs ? argmax(lastProbs) : m.action;
  lastPlayed = m.action;
  winState[winPtr] = STATE_CODE[lastState];
  winCost[winPtr] = m.cost;
  winPtr = (winPtr + 1) % WINDOW;
  winCount = Math.min(winCount + 1, WINDOW);
  env.step(m.action);
  view.record(env, lastState, m.action);
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
    const budgetEnd = now + 10; // at most ~10 ms of moves per frame, so rendering stays smooth
    while (acc >= 1 && performance.now() < budgetEnd) {
      playMove();
      acc -= 1;
    }
    if (acc > 50) acc = 50;
  }
  if (now - secondStart >= 1000) {
    actualSpeed = (movesThisSecond * 1000) / (now - secondStart);
    movesThisSecond = 0;
    secondStart = now;
  }
  view.draw(env, lastState);
  if (lastProbs && lastEncoding && (now - lastShown > 80 || !shown)) {
    shown = { probs: lastProbs, encoding: lastEncoding, chosen: lastChoice, played: lastPlayed, state: lastState };
    lastShown = now;
    network?.update(
      { trace: student.net.trace(shown.encoding), probs: shown.probs, chosen: shown.chosen, threshold, deciderVar: STATE_VAR[shown.state] },
      game.input,
    );
  }
  drawBars(barsCanvas, env.actionNames, shown?.probs ?? null, shown?.chosen ?? 0, shown?.played ?? 0, threshold);
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

function updateReadouts(): void {
  $('r-score').textContent = game.scoreLabel(env);
  $('r-episode').textContent = String(episode);
  const recent = episodeScores.slice(-10);
  $('r-avg').textContent = recent.length ? (recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(0) : '–';
  $('r-speed').textContent = paused ? 'paused' : actualSpeed ? actualSpeed.toFixed(0) : '–';
  $('now-label').textContent = STATE_LABEL[lastState];
  $('now-dot').style.background = cssVar(root, STATE_VAR[lastState]);
  if (!winCount) return;
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

btnPretrained.addEventListener('click', async () => {
  btnPretrained.disabled = true;
  try {
    const res = await fetch(`./data/${game.def.name}-weights.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    applyPolicy((await res.json()) as SerializedPolicy, 'pretrained (run 1 of the 5-run study)');
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
  for (const b of document.querySelectorAll<HTMLButtonElement>('#game-tabs button')) b.disabled = on;
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
  $('train-status').textContent = 'Bootstrap: the planner plays the first games to create labels…';
  worker.postMessage({ type: 'start', game: game.def.name, config: {} } satisfies ToWorker);
  setTraining(true);
});

function drawCurves(): void {
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
  drawLines(scoreCanvas, [{ label: 'score', color: cssVar(root, '--s1'), values: log.map((e) => e.meanScore) }], game.scoreMax, (v) => String(v));
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
  download(blob, filename.replace('snake', game.def.name));
  $('rec-hint').textContent = `Saved ${filename} (${(blob.size / 1024).toFixed(0)} KB).`;
});

// ——— Frontier (published multi-run study) ———
let study: StudyFile | null = null;
let frontier: FrontierPoint[] = [];
let layout: ScatterLayout | null = null;

function livePoint(): FrontierPoint | null {
  if (episodeScores.length < 3 || !winCount) return null;
  let cost = 0;
  for (let i = 0; i < winCount; i++) cost += winCost[i];
  const recent = episodeScores.slice(-10);
  return { label: `live game (last ${recent.length} episodes)`, kind: 'other', cost: cost / winCount, score: recent.reduce((a, b) => a + b, 0) / recent.length, ci95: 0, zeroCost: false };
}

function pointLabel(p: FrontierPoint): string {
  const cost = p.zeroCost ? '0' : formatTick(Number(p.cost.toFixed(1)));
  return `${p.label} · score ${p.score.toFixed(1)}${p.ci95 ? ` ±${p.ci95.toFixed(1)}` : ''} · ${cost} units/move`;
}

function drawFrontier(): void {
  if (!frontier.length) return;
  const color = { system2: cssVar(root, '--s2'), hybrid: cssVar(root, '--ink-3'), 'hybrid+guard': cssVar(root, '--s1'), baseline: cssVar(root, '--ink-2'), other: cssVar(root, '--ink-3') };
  const shape = { system2: 'square', hybrid: 'ring', 'hybrid+guard': 'circle', baseline: 'diamond', other: 'diamond' } as const;
  const xDomain = costDomain(frontier);
  const yDomain = scoreDomain(frontier);
  const points: ScatterPoint[] = frontier.map((p) => ({ x: p.zeroCost ? xDomain[0] : p.cost, y: p.score, yErr: p.ci95, shape: shape[p.kind], color: color[p.kind], label: pointLabel(p) }));
  const live = livePoint();
  if (live) points.push({ x: Math.min(Math.max(live.cost, xDomain[0]), xDomain[1]), y: live.score, shape: 'ring', color: cssVar(root, '--here'), label: pointLabel(live), highlight: true });
  const reference = referencePoint(frontier, game.def.referenceLevel);
  layout = drawScatter(frontierCanvas, points, xDomain, yDomain, 'compute units per move (log)', 'mean score', (ctx, x, y) => {
    if (!reference) return;
    // H2 target region: at least 90% of the planner's score for at most a tenth of its cost.
    const x0 = x(xDomain[0]);
    const x1 = x(reference.cost / 10);
    const y0 = y(yDomain[1]);
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

async function loadStudy(name: string): Promise<void> {
  study = null;
  frontier = [];
  const ctx = frontierCanvas.getContext('2d');
  ctx?.clearRect(0, 0, frontierCanvas.width, frontierCanvas.height);
  try {
    const res = await fetch(`./data/${name}-study.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as StudyFile;
    if (name !== game.def.name) return; // the visitor switched game meanwhile
    study = data;
    frontier = frontierPoints(study);
    const ref = referencePoint(frontier, game.def.referenceLevel);
    const guard07 = frontier.find((p) => p.label === 'hybrid+guard maxProb@0.7');
    $('frontier-sub').textContent =
      `Mean of ${study.runs} training runs on ${study.seeds.count} held-out ${study.split} seeds, with 95% intervals. ` +
      'Up is better, left is cheaper. The shaded target: at least 90% of the planner’s score for a tenth of its cost.';
    $('cost-context').textContent = ref
      ? `whole-game averages: planner ${ref.cost.toFixed(0)}${guard07 ? ` · hybrid + guard @0.7 ${guard07.cost.toFixed(0)}` : ''}`
      : '';
    drawFrontier();
  } catch (err) {
    $('frontier-sub').textContent = `Could not load the published results: ${String(err)}`;
  }
}
setInterval(drawFrontier, 1000);

// ——— Game selector ———
function selectGame(name: string): void {
  if (training) return;
  game = demoGame(name);
  env = game.def.makeEnv();
  view = game.createView(boardCanvas);
  root.style.setProperty('--board-aspect', game.aspect);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#game-tabs button')) b.setAttribute('aria-current', String(b.dataset.game === name));
  $('game-blurb').textContent = game.def.title + ' — ' + game.blurb;
  $('network-legend').textContent =
    game.input.kind === 'window'
      ? 'Inputs: the 7×7 window around the head (colored by what each cell holds), then food direction and length. Hidden layers: 64 + 64 ReLU units. Outputs: straight, left, right.'
      : `Inputs, top to bottom: ${game.input.labels.join(', ')}. Hidden layers: 64 + 64 ReLU units. Outputs: ${env.actionNames.join(', ')}.`;
  log.length = 0;
  drawCurves();
  $('train-status').textContent = 'Idle. Training takes one to two minutes on a laptop and runs in a background worker.';
  setModel(untrainedNet(), 1, 'Model: untrained (random weights)');
  resetGame(Math.max(1, Math.floor(Number(seedInput.value)) || 1));
  void loadStudy(name);
  history.replaceState(null, '', `#${name}`);
}

const tabs = $('game-tabs');
for (const g of DEMO_GAMES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.game = g.def.name;
  b.textContent = g.def.title;
  b.addEventListener('click', () => selectGame(g.def.name));
  tabs.append(b);
}

// ——— Network view (lazy, WebGL) ———
let network: NetworkView | null = null;
void import('./network-view').then(async ({ NetworkView }) => {
  network = await NetworkView.create($('network'));
  network?.setModel(student.net, game.input, env.actionNames);
});

// ——— Theme and resize ———
$('theme').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  drawCurves();
  drawFrontier();
});
new ResizeObserver(() => {
  drawCurves();
  drawFrontier();
}).observe(document.body);

syncOutputs();
selectGame(location.hash.slice(1) || DEMO_GAMES[0].def.name);
requestAnimationFrame(frame);
