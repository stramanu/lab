/**
 * The System One page: the live game (who decided each move, what it cost), System One's output and
 * its 3D forward pass, the controls, and the panels (in-tab training, the published frontier, "This
 * game"). Game-specific extras live in their own modules.
 */
import { argmax, type ContinuousEnv, type Env, type MoveRecord, type Player } from '../src/core/types';
import { QuadrupedEnv } from '../src/games/quadruped';
import { ContinuousHybridPlayer, ContinuousStudentPlayer, HybridPlayer, NetStudent, StudentPlayer } from '../src/hybrid';
import { Ensemble, Mlp, importEnsemble, importPolicy } from '../src/nn';
import { DEFAULT_CONTINUOUS_PIPELINE, DEFAULT_PIPELINE } from '../src/training';
import { drawBars, drawGauges } from './bars';
import { cssVar } from './charts';
import { DecisionWindow } from './decision-window';
import { $ } from './dom';
import { hiddenOf, networkLegend, renderExplainer } from './explainer-panel';
import type { FrontierPoint } from './frontier';
import { FrontierPanel } from './frontier-panel';
import { STATE_VAR, decisionState, type BoardView, type DecisionState } from './game-view';
import { DEMO_GAMES, demoGame, type DemoGame } from './games';
import { LanderWind } from './lander-wind';
import type { NetworkView } from './network-view';
import { PlannerWorkerClient } from './planner-worker-client';
import { QuadrupedControls } from './quadruped-controls';
import type { Weights } from './protocol';
import { RacingExtras } from './racing-extras';
import { CanvasRecorder, download } from './recorder';
import { initTheme } from './theme';
import { TrainingPanel } from './training-panel';

const root = document.documentElement;
const boardCanvas = $<HTMLCanvasElement>('board');
const barsCanvas = $<HTMLCanvasElement>('bars');
const thresholdInput = $<HTMLInputElement>('threshold');
const speedInput = $<HTMLInputElement>('speed');
const guardInput = $<HTMLInputElement>('guard');
const plannerInput = $<HTMLInputElement>('planner-on');
const seedInput = $<HTMLInputElement>('seed');
const btnPretrained = $<HTMLButtonElement>('btn-pretrained');
const btnRecord = $<HTMLButtonElement>('btn-record');
const btnPause = $<HTMLButtonElement>('btn-pause');

// ——— Per-game state ———
let game: DemoGame = DEMO_GAMES[0];
let env: Env = game.def.makeEnv();
let view: BoardView = game.createView(boardCanvas);
/** Discrete games: a policy network. Continuous games: a regression ensemble. */
let student: NetStudent | null = null;
let ensemble: Ensemble | null = null;
let hybrid!: Player;
let threshold = Number(thresholdInput.value);
let guardOn = guardInput.checked;
let plannerOn = plannerInput.checked;

// ——— Live play ———
let seed = Number(seedInput.value) || 1;
let episode = 1;
const episodeScores: number[] = [];
const decisions = new DecisionWindow(1000);
let lastState: DecisionState = 'system1';
let lastProbs: Float32Array | null = null;
let lastChoice = 0;
let lastPlayed = 0;
let lastEncoding: Float32Array | null = null;
let lastConfidence: number | null = null;
let lastTeacherAction: Float64Array | null = null;

/**
 * The decision shown by the bars and the 3D view. It is refreshed at most every
 * 80 ms from the latest move, so both panels always show the same decision.
 */
let shown: {
  probs: Float32Array | null;
  encoding: Float32Array;
  chosen: number;
  played: number;
  state: DecisionState;
  confidence: number | null;
  teacherAction: Float64Array | null;
} | null = null;
let lastShown = 0;

// ——— Modules ———
const racing = new RacingExtras(() => resetGame(seed));
const wind = new LanderWind();
const quadruped = new QuadrupedControls();
const planner = new PlannerWorkerClient();
const training = new TrainingPanel(
  {
    onPolicy: (policy, source) => applyPolicy(policy, source),
    onRunning: (on) => {
      btnPretrained.disabled = on || Boolean(game.preview);
      for (const b of document.querySelectorAll<HTMLButtonElement>('#game-tabs button')) b.disabled = on;
    },
  },
  () => game.def.name,
  () => (game.def.continuous ? { ...DEFAULT_CONTINUOUS_PIPELINE, ...game.def.continuous.pipeline } : { ...DEFAULT_PIPELINE, ...game.def.pipeline }).iterations,
);
const frontier = new FrontierPanel(livePoint);

function livePoint(): FrontierPoint | null {
  if (episodeScores.length < 3 || !decisions.count) return null;
  const recent = episodeScores.slice(-10);
  return { label: `live game (last ${recent.length} episodes)`, kind: 'other', cost: decisions.meanCost(), score: recent.reduce((a, b) => a + b, 0) / recent.length, ci95: 0, zeroCost: false };
}

// ——— Models ———
function rebuildHybrid(): void {
  const c = game.def.continuous;
  // Planner off: System One decides every move alone (no threshold, no guard, which would hand moves to the planner).
  guardInput.disabled = thresholdInput.disabled = !plannerOn;
  if (!plannerOn) {
    if (c && ensemble) hybrid = new ContinuousStudentPlayer(ensemble);
    else if (student) hybrid = new StudentPlayer(student);
    return;
  }
  if (c && ensemble) {
    hybrid = new ContinuousHybridPlayer(ensemble, c.makeTeacher(game.def.referenceLevel), c.agrees, { threshold, auditRate: 0 }, guardOn ? c.makeGuard() : undefined);
  } else if (student) {
    hybrid = new HybridPlayer(student, game.def.makeTeacher(game.def.referenceLevel), { threshold, auditRate: 0 }, guardOn ? game.def.makeGuard() : undefined);
  }
}

/** The network shown in 3D: the policy, or the first ensemble member. */
const shownNet = (): Mlp => (ensemble ? ensemble.members[0] : student!.net);

function setUntrained(): void {
  const hidden = hiddenOf(game);
  if (game.def.continuous) {
    const ce = env as ContinuousEnv;
    setEnsemble(new Ensemble({ inputSize: env.encodingSize, hidden, low: [...ce.actionLow], high: [...ce.actionHigh], members: 5, seed: 20260923 }), 'Model: untrained (5 random networks)');
  } else {
    setModel(new Mlp({ inputSize: env.encodingSize, hidden, outputSize: env.numActions, seed: 20260923 }), 1, 'Model: untrained (random weights)');
  }
}

function setModel(net: Mlp, temperature: number, info: string): void {
  student = new NetStudent(net, temperature, 'maxProb');
  ensemble = null;
  rebuildHybrid();
  $('model-info').textContent = info;
  network?.setModel(net, game.input, env.actionNames);
}

function setEnsemble(e: Ensemble, info: string): void {
  ensemble = e;
  student = null;
  rebuildHybrid();
  $('model-info').textContent = info;
  network?.setModel(e.members[0], game.input, game.def.continuous!.actionLabels);
}

function applyPolicy(policy: Weights, source: string): void {
  const kb = (JSON.stringify(policy).length / 1024).toFixed(1);
  if (policy.format === 'systemone-ensemble') {
    const e = importEnsemble(policy);
    setEnsemble(e, `Model: ${source} · ensemble of ${e.members.length} × ${e.members[0].numParams.toLocaleString('en-US')} params · ${kb} KB`);
    return;
  }
  const { net, calibrationT } = importPolicy(policy);
  setModel(net, calibrationT, `Model: ${source} · ${net.numParams.toLocaleString('en-US')} params · ${kb} KB · T=${calibrationT.toFixed(2)}`);
}

// ——— Moves ———
function resetGame(newSeed: number): void {
  planner.cancel();
  seed = newSeed;
  episode = 1;
  episodeScores.length = 0;
  decisions.clear();
  guardSaves = 0;
  $('guard-saves').textContent = '0';
  env.reset(seed);
  view.reset();
  racing.reset(seed);
  lastProbs = null;
  shown = null;
}

function playMove(): void {
  if (planner.busy) return; // waiting for the planner's answer
  if (env.isDone()) {
    episodeScores.push(env.score());
    if (episodeScores.length > 50) episodeScores.shift();
    episode++;
    env.reset(seed + episode - 1);
    view.reset();
    racing.reset(seed + episode - 1);
  }
  // The quadruped's planner runs in a worker; System One and the guard decide here.
  if (env instanceof QuadrupedEnv && hybrid instanceof ContinuousHybridPlayer) {
    const p = hybrid.propose(env);
    if ('move' in p) applyMove(p.move);
    else planner.request(env, hybrid, p.escalation, applyMove);
    return;
  }
  applyMove(hybrid.act(env));
}

let guardSaves = 0;
/** Restarts the guard's glow on the board and on its row (one per stopped move, visible at any speed). */
function flashGuard(): void {
  guardSaves++;
  $('guard-saves').textContent = String(guardSaves);
  for (const el of [$('board-wrap'), document.querySelector<HTMLElement>('.tier[data-state="guard"]')!]) {
    el.classList.remove('guard-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('guard-flash');
  }
}

function applyMove(m: MoveRecord): void {
  lastState = decisionState(m.decider, m.escalationReason);
  if (lastState === 'guard') flashGuard();
  lastProbs = m.probs ?? null;
  lastEncoding = m.state ?? null;
  lastConfidence = m.confidence ?? null;
  lastTeacherAction = m.teacherAction ?? null;
  lastChoice = lastProbs ? argmax(lastProbs) : m.action;
  lastPlayed = m.action;
  decisions.push(lastState, m.cost);
  if (m.continuous) (env as ContinuousEnv).stepContinuous(m.continuous);
  else env.step(m.action);
  racing.afterMove(env, m);
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
const sliderFromSpeed = (moves: number) => Math.log(moves / 5) / Math.log(400);

function frame(now: number): void {
  const dt = Math.min(100, now - lastFrame);
  lastFrame = now;
  if (!paused) {
    acc += (dt * speedFromSlider(Number(speedInput.value))) / 1000;
    const budgetEnd = now + 10; // at most ~10 ms of moves per frame, so rendering stays smooth
    while (acc >= 1 && performance.now() < budgetEnd && !planner.busy) {
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
  if (lastEncoding && (now - lastShown > 80 || !shown)) {
    shown = { probs: lastProbs, encoding: lastEncoding, chosen: lastChoice, played: lastPlayed, state: lastState, confidence: lastConfidence, teacherAction: lastTeacherAction };
    lastShown = now;
    updateNetwork(shown);
  }
  const c = game.def.continuous;
  if (c && ensemble) {
    const ce = env as ContinuousEnv;
    const studentAction = shown ? ensemble.decide(shown.encoding).action : null;
    drawGauges(barsCanvas, c.actionLabels, ce.actionLow, ce.actionHigh, studentAction, shown?.teacherAction ?? null, shown?.confidence ?? null, threshold);
  } else {
    drawBars(barsCanvas, env.actionNames, shown?.probs ?? null, shown?.chosen ?? 0, shown?.played ?? 0, threshold);
  }
  if (now - lastDomUpdate > 120) {
    updateReadouts();
    racing.draw();
    lastDomUpdate = now;
  }
  requestAnimationFrame(frame);
}

function updateNetwork(d: NonNullable<typeof shown>): void {
  if (!network) return;
  const trace = shownNet().trace(d.encoding);
  if (ensemble && game.def.continuous) {
    // Continuous outputs are normalized to [−1, 1]; size nodes by magnitude and label them with values.
    const labels = game.def.continuous.actionLabels;
    const values = Array.from(trace.logits, (v) => Math.max(-1, Math.min(1, v)));
    network.update(
      {
        trace,
        probs: values.map((v) => Math.abs(v)),
        chosen: -1,
        threshold,
        deciderVar: STATE_VAR[d.state],
        // Member outputs are normalized; show them in the action's units (steering in rad, pedal −1…+1).
        outputLabels: labels.map((l, k) => {
          const { low, high } = ensemble!.config;
          const v = low[k] + ((values[k] + 1) / 2) * (high[k] - low[k]);
          return `${l} ${v >= 0 ? '+' : ''}${v.toFixed(2)}${l === 'steering' ? ' rad' : ''}`;
        }),
      },
      game.input,
    );
    return;
  }
  if (!d.probs) return;
  network.update({ trace, probs: d.probs, chosen: d.chosen, threshold, deciderVar: STATE_VAR[d.state] }, game.input);
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
  if (!decisions.count) return;
  const shares = decisions.shares();
  const pct = (v: number) => `${(100 * v).toFixed(decisions.count >= 100 ? 1 : 0)}%`;
  $('t-system1').textContent = pct(shares.system1);
  $('t-guard').textContent = pct(shares.guard);
  $('t-system2').textContent = pct(shares.system2);
  const perMove = decisions.meanCost();
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
plannerInput.addEventListener('change', () => {
  plannerOn = plannerInput.checked;
  planner.cancel();
  rebuildHybrid();
});
seedInput.addEventListener('change', () => resetGame(Math.max(1, Math.floor(Number(seedInput.value)) || 1)));
btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? 'Resume' : 'Pause';
});

/** Loads the published network (run 1 of the study); ignored if the visitor switched game meanwhile. */
async function loadPretrained(): Promise<void> {
  const name = game.def.name;
  btnPretrained.disabled = true;
  try {
    const res = await fetch(`../data/${name}-weights.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const weights = (await res.json()) as Weights;
    if (game.def.name === name && !training.running) applyPolicy(weights, 'pretrained (run 1 of the 5-run study)');
  } catch (err) {
    if (game.def.name === name) $('model-info').textContent = `Could not load the pretrained weights: ${String(err)}`;
  } finally {
    btnPretrained.disabled = training.running || Boolean(game.preview);
  }
}
btnPretrained.addEventListener('click', () => void loadPretrained());

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

// ——— Game selector ———
async function selectGame(name: string): Promise<void> {
  if (training.running) return;
  const next = demoGame(name);
  if (next.def.init) {
    $('game-blurb').textContent = `${next.def.title} — loading the physics engine…`;
    await next.def.init();
  }
  game = next;
  planner.cancel();
  (env as { dispose?: () => void }).dispose?.(); // frees the previous game's WebAssembly world (quadruped)
  env = game.def.makeEnv();
  (view as { dispose?: () => void }).dispose?.();
  view = game.createView(boardCanvas);
  racing.configure(view, game.def);
  wind.attach(env);
  quadruped.attach(env, () => seed + episode - 1, () => resetGame(seed));
  root.style.setProperty('--board-aspect', game.aspect);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#game-tabs button')) b.setAttribute('aria-current', String(b.dataset.game === name));
  $('game-blurb').textContent = game.def.title + ' — ' + game.blurb;
  // Games whose network is not published yet are marked as previews.
  $('preview-note').hidden = !game.preview;
  $('preview-note').textContent = game.preview ?? '';
  btnPretrained.disabled = Boolean(game.preview);
  renderExplainer(game, env);
  $('network-legend').textContent = networkLegend(game, env);
  // The quadruped's planner needs ~0.2 s per decision: training takes hours, so it is done offline.
  training.reset(
    game.scoreMax,
    game.def.name === 'quadruped'
      ? 'Training this game takes hours (every planner decision simulates 21 futures in the physics engine), so it is done offline; the page uses the published network.'
      : null,
  );
  setUntrained();
  if (game.preview) $('model-info').textContent = 'Model: not published yet (the network is in training)';
  $('policy-title').textContent = game.def.continuous ? "System One's action" : "System One's policy";
  $('s1-cost').textContent = game.def.continuous ? 'ensemble of 5 · 5 units' : 'network alone · 1 unit';
  speedInput.value = String(sliderFromSpeed(game.speed));
  syncOutputs();
  resetGame(Math.max(1, Math.floor(Number(seedInput.value)) || 1));
  // Every game starts with its published network; "Train in this tab" starts again from random weights.
  if (!game.preview) {
    $('model-info').textContent = 'Model: loading the published network…';
    void loadPretrained();
  }
  void frontier.load(name, game.def.referenceLevel, () => game.def.name);
  history.replaceState(null, '', `#${name}`);
}

const tabs = $('game-tabs');
for (const g of DEMO_GAMES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.game = g.def.name;
  b.textContent = g.def.title;
  if (g.preview) b.insertAdjacentHTML('beforeend', ' <small class="tab-preview">preview</small>');
  b.addEventListener('click', () => void selectGame(g.def.name));
  tabs.append(b);
}

// ——— Network view (lazy, WebGL) ———
let network: NetworkView | null = null;
void import('./network-view').then(async ({ NetworkView }) => {
  network = await NetworkView.create($('network'));
  if (network) {
    if (ensemble && game.def.continuous) network.setModel(ensemble.members[0], game.input, game.def.continuous.actionLabels);
    else if (student) network.setModel(student.net, game.input, env.actionNames);
  }
});

// ——— Theme and resize ———
initTheme(() => {
  training.draw();
  frontier.draw();
});
new ResizeObserver(() => {
  training.draw();
  frontier.draw();
}).observe(document.body);

syncOutputs();
// The first game may need an asynchronous setup (the quadruped's physics engine): start the loop after it.
void selectGame(location.hash.slice(1) || DEMO_GAMES[0].def.name).then(() => requestAnimationFrame(frame));
