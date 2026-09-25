/**
 * The Unitree Go1 in the browser (the lab's applied side): MuJoCo's WebAssembly build simulates the robot
 * in real time, and the policy trained in MuJoCo Playground drives it from a joystick command. Visitors
 * steer it with the keyboard or the sliders, switch terrain and push it.
 */
import loadMujoco, { type MainModule, type MjData, type MjModel } from '@mujoco/mujoco';
import { cssVar } from '../../charts';
import { $ } from '../../dom';
import { initTheme } from '../../theme';
import { BraxPolicy, type BraxPolicyExport } from '../brax-policy';
import { GO1_DEFAULTS, Go1Task, type Go1Constants } from '../go1-controller';
import { Go1Jump } from './jump';
import { SceneView } from './scene-view';

const ASSETS = new URL('../assets/go1/', location.href);
/**
 * The page's scenes use the full-collision robot, so a fallen robot lies on the ground; the policy was
 * trained on the feet-only model, which is the same while walking (only the feet touch the ground).
 */
const FILES = ['page_flat.xml', 'page_rough.xml', 'page_course.xml', 'scene_mjx_fullcollisions_flat_terrain.xml', 'go1_mjx_fullcollisions.xml', 'sensor_feet.xml', 'sensor_fullcollision.xml', 'assets/hfield.png', 'assets/rocky_texture.png', 'meshes/trunk.stl', 'meshes/hip.stl', 'meshes/thigh.stl', 'meshes/thigh_mirror.stl', 'meshes/calf.stl'];
type Terrain = 'flat' | 'rough' | 'course';
/** Half-size of the rough heightfield that the robot may use before it restarts (the field is 20 × 20 m). */
const ROUGH_EDGE = 9;

/** Command limits (m/s, m/s, rad/s) within Playground's training ranges. */
const LIMITS = { vx: 1.0, vy: 0.6, yaw: 1.0 };
/** Visitor pushes: base velocity change per metre dragged (m/s), and its cap. */
const DRAG_GAIN = 2.5;
const DRAG_MAX = 1.5;

initTheme();

let mujoco: MainModule;
let THREE: typeof import('three');
let model: MjModel | null = null;
let data: MjData | null = null;
let task: Go1Task | null = null;
let view: SceneView | null = null;
let policy: BraxPolicy | null = null;
let constants: Go1Constants = GO1_DEFAULTS;
let terrain: Terrain = 'flat';
let feetSites: number[] = [];
let jump: Go1Jump | null = null;
let episode = 0;
let falls = 0;
let origin: [number, number] = [0, 0];
let fellAt = -1;
const command = new Float64Array(3);
const keys = new Set<string>();
const obs = new Float64Array(48);

const status = (s: string) => ($('go1-status').textContent = s);

async function loadFiles(): Promise<void> {
  mujoco.FS.mkdir('/go1');
  mujoco.FS.mkdir('/go1/assets');
  mujoco.FS.mkdir('/go1/meshes');
  await Promise.all(FILES.map(async (f) => mujoco.FS.writeFile(`/go1/${f}`, new Uint8Array(await (await fetch(new URL(f, ASSETS))).arrayBuffer()))));
}

async function loadPolicy(): Promise<void> {
  const res = await fetch(new URL('go1-policy.json', ASSETS));
  // Static hosts may answer a missing file with the site's HTML: only JSON counts.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
    $('go1-policy').textContent = 'Policy: not published yet (training on a GPU). The robot holds its standing pose.';
    return;
  }
  const exp = (await res.json()) as BraxPolicyExport & { constants?: Partial<Go1Constants>; gpu?: string };
  policy = new BraxPolicy(exp);
  constants = { ...GO1_DEFAULTS, ...(exp.constants ?? {}) };
  $('go1-policy').textContent = `Policy: PPO, trained in MuJoCo Playground on ${exp.gpu ?? 'a GPU'} · 48 inputs → 512 → 256 → 128 → 12 joint targets, 50 Hz`;
}

function build(): void {
  view?.dispose();
  data?.delete();
  model?.delete();
  model = mujoco.MjModel.from_xml_path(`/go1/page_${terrain}.xml`);
  data = new mujoco.MjData(model);
  task = new Go1Task(mujoco, model, data, constants);
  jump = new Go1Jump(constants);
  feetSites = ['FR', 'FL', 'RR', 'RL'].map((n) => mujoco.mj_name2id(model!, mujoco.mjtObj.mjOBJ_SITE.value, n));
  view = new SceneView(
    THREE,
    $<HTMLCanvasElement>('go1-view'),
    model,
    { ground: cssVar(document.body, '--board'), grid: cssVar(document.body, '--board-grid'), robot: cssVar(document.body, '--ink-2'), background: cssVar(document.body, '--paper') },
  );
  resetEpisode();
}

/** Read-only view of the live simulation, for automated checks of the page. */
(window as unknown as { go1Debug: () => unknown }).go1Debug = () => ({
  terrain,
  episode,
  falls,
  fellAt,
  z: data ? (data.qpos as Float64Array)[2] : null,
  up: data ? (data.qpos as Float64Array).slice(3, 7) : null,
  command: Array.from(command),
  time: data ? (data.time as number) : null,
});

function resetEpisode(): void {
  if (!task || !data) return;
  task.reset(1 + episode++);
  const q = data.qpos as Float64Array;
  if (terrain === 'course') {
    // The course runs along +x: start at the origin, facing it.
    q[0] = q[1] = 0;
    q[3] = 1;
    q[4] = q[5] = q[6] = 0;
    mujoco.mj_forward(model!, data);
  }
  origin = [q[0], q[1]];
  fellAt = -1;
  jump?.cancel();
}

/** A fall that is not a flip: the trunk down near the feet (lying on its side or belly). */
function collapsed(): boolean {
  const q = data!.qpos as Float64Array;
  const s = data!.site_xpos as Float64Array;
  const lowestFoot = Math.min(...feetSites.map((id) => s[3 * id + 2]));
  return q[2] - lowestFoot < 0.12;
}

/** The command from the keyboard (held keys) or, when no key is held, from the sliders. */
function readCommand(): void {
  if (keys.size) {
    command[0] = (keys.has('w') || keys.has('arrowup') ? LIMITS.vx : 0) - (keys.has('s') || keys.has('arrowdown') ? LIMITS.vx * 0.6 : 0);
    command[1] = (keys.has('a') ? LIMITS.vy : 0) - (keys.has('d') ? LIMITS.vy : 0);
    command[2] = (keys.has('q') || keys.has('arrowleft') ? LIMITS.yaw : 0) - (keys.has('e') || keys.has('arrowright') ? LIMITS.yaw : 0);
  } else {
    command[0] = Number($<HTMLInputElement>('cmd-vx').value);
    command[1] = Number($<HTMLInputElement>('cmd-vy').value);
    command[2] = Number($<HTMLInputElement>('cmd-yaw').value);
  }
}

let simTime = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (task && data && view) {
    readCommand();
    simTime += dt;
    // Real time: one control step (20 ms) per 20 ms of wall-clock time.
    while (simTime >= constants.ctrl_dt) {
      simTime -= constants.ctrl_dt;
      // A jump in progress overrides the policy.
      const action = jump?.active ? jump.next() : policy ? policy.act(task.observe(command, obs)) : new Float64Array(12);
      task.act(action);
      // The crouch of a jump brings the trunk near the feet on purpose: only a flip counts then.
      if (fellAt < 0 && (task.fell() || (!jump?.active && collapsed()))) {
        falls++;
        fellAt = now;
      }
    }
    if (fellAt >= 0 && now - fellAt > 1500) resetEpisode();
    const qq = data.qpos as Float64Array;
    if (terrain === 'rough' && (Math.abs(qq[0]) > ROUGH_EDGE || Math.abs(qq[1]) > ROUGH_EDGE)) resetEpisode();
    const q = data.qpos as Float64Array;
    view.draw(data, [q[0], q[1], q[2]]);
    const walked = Math.hypot(q[0] - origin[0], q[1] - origin[1]);
    $('go1-readout').textContent = `command ${command[0].toFixed(2)} m/s forward · ${command[1].toFixed(2)} sideways · ${command[2].toFixed(2)} rad/s turn   |   ${walked.toFixed(1)} m from the start · falls ${falls}${jump?.active ? ` · jump: ${jump.phaseName}` : ''}${fellAt >= 0 ? ' · fell, restarting…' : ''}`;
  }
  requestAnimationFrame(frame);
}

/** Space bar: a jump with the robot's own legs (a hand-written sequence; see jump.ts). */
function hop(): void {
  if (!policy || fellAt >= 0) return;
  jump?.start(command[0]);
}

function wireControls(): void {
  $('go1-hop').addEventListener('click', hop);
  for (const id of ['cmd-vx', 'cmd-vy', 'cmd-yaw']) {
    const input = $<HTMLInputElement>(id);
    const out = $(`${id}-out`);
    const sync = () => (out.textContent = Number(input.value).toFixed(2));
    input.addEventListener('input', sync);
    sync();
  }
  $('cmd-stop').addEventListener('click', () => {
    for (const id of ['cmd-vx', 'cmd-vy', 'cmd-yaw']) {
      $<HTMLInputElement>(id).value = '0';
      $<HTMLInputElement>(id).dispatchEvent(new Event('input'));
    }
  });
  $('go1-reset').addEventListener('click', resetEpisode);
  $<HTMLSelectElement>('go1-terrain').addEventListener('change', (e) => {
    terrain = (e.target as HTMLSelectElement).value as Terrain;
    build();
  });
  const drivingKeys = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === ' ' && !(e.target as HTMLElement).closest('input, select, textarea, button')) {
      e.preventDefault();
      if (!e.repeat) hop();
      return;
    }
    const k = e.key.toLowerCase();
    if (!drivingKeys.has(k) || (e.target as HTMLElement).closest('input, select, textarea')) return;
    keys.add(k);
    e.preventDefault();
  });
  addEventListener('keyup', (e: KeyboardEvent) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  // Pushes: drag on the robot; the base's horizontal velocity changes along the drag.
  const canvas = $<HTMLCanvasElement>('go1-view');
  let start: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!view || !data) return;
    start = view.pointOnPlane(e, (data.qpos as Float64Array)[2]);
    if (start) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!start || !view || !data) return;
    const end = view.pointOnPlane(e, (data.qpos as Float64Array)[2]);
    if (end) {
      const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
      const len = Math.hypot(dx, dy);
      if (len > 0.03) {
        const dv = Math.min(DRAG_MAX, DRAG_GAIN * len);
        const v = data.qvel as Float64Array;
        v[0] += (dx / len) * dv;
        v[1] += (dy / len) * dv;
      }
    }
    start = null;
  });
}

async function main(): Promise<void> {
  status('Loading MuJoCo and the robot…');
  const [mj, three] = await Promise.all([loadMujoco(), import('three')]);
  mujoco = mj;
  THREE = three;
  await Promise.all([loadFiles(), loadPolicy()]);
  wireControls();
  build();
  status('');
  requestAnimationFrame(frame);
}

main().catch((err) => status(`Could not start the simulation: ${String(err)}`));
