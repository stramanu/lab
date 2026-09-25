/**
 * Feasibility spike A1 (openspec/changes/add-applied-mujoco-spike/design.md): can the browser simulate the
 * Go1 scene at least at real time with a policy-sized MLP at 50 Hz? Writes the result as JSON into
 * `window.spikeResult` and the page.
 */
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { Rng } from '../../../src/core/rng';
import { BraxPolicy, type BraxPolicyExport } from '../brax-policy';
import { GO1_DEFAULTS, Go1Task, type Go1Constants } from '../go1-controller';

const FILES = [
  'scene_mjx_feetonly_flat_terrain.xml',
  'scene_mjx_feetonly_rough_terrain.xml',
  'go1_mjx_feetonly.xml',
  'sensor_feet.xml',
  'assets/hfield.png',
  'assets/rocky_texture.png',
  'meshes/trunk.stl',
  'meshes/hip.stl',
  'meshes/thigh.stl',
  'meshes/thigh_mirror.stl',
  'meshes/calf.stl',
];
const SIM_SECONDS = 20;
const CONTROL_DT = 0.02;
const LAYERS = [48, 512, 256, 128, 12];

const log = document.getElementById('log')!;
const say = (s: string) => (log.textContent += `\n${s}`);

/** A plain MLP with random weights, the size of Playground's default PPO policy. */
function makePolicy(): (x: Float64Array) => Float64Array {
  const rng = Rng.stream(1, 'go1-spike-policy');
  const weights = LAYERS.slice(1).map((n, l) => Float64Array.from({ length: n * LAYERS[l] }, () => rng.normal() * Math.sqrt(1 / LAYERS[l])));
  const acts = LAYERS.map((n) => new Float64Array(n));
  return (x) => {
    acts[0].set(x);
    for (let l = 1; l < LAYERS.length; l++) {
      const [n, m, w, a, out] = [LAYERS[l], LAYERS[l - 1], weights[l - 1], acts[l - 1], acts[l]];
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let i = 0; i < m; i++) s += w[j * m + i] * a[i];
        out[j] = l < LAYERS.length - 1 ? Math.max(0, s) : Math.tanh(s);
      }
    }
    return acts[LAYERS.length - 1];
  };
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const mujoco = await loadMujoco();
  say(`MuJoCo loaded in ${(performance.now() - t0).toFixed(0)} ms`);
  const base = new URL('../go1/', location.href);
  mujoco.FS.mkdir('/go1');
  mujoco.FS.mkdir('/go1/assets');
  mujoco.FS.mkdir('/go1/meshes');
  for (const f of FILES) mujoco.FS.writeFile(`/go1/${f}`, new Uint8Array(await (await fetch(new URL(f, base))).arrayBuffer()));
  say(`scene files fetched in ${(performance.now() - t0).toFixed(0)} ms`);

  const policy = makePolicy();
  const results: Record<string, unknown> = {};
  for (const terrain of ['flat', 'rough']) {
    const model = mujoco.MjModel.from_xml_path(`/go1/scene_mjx_feetonly_${terrain}_terrain.xml`);
    const data = new mujoco.MjData(model);
    mujoco.mj_resetDataKeyframe(model, data, 0);
    const dt = model.opt.timestep as number;
    const substeps = Math.round(CONTROL_DT / dt);
    const home = Float64Array.from(data.ctrl as ArrayLike<number>);
    const obs = new Float64Array(48);
    const steps = Math.round(SIM_SECONDS / dt);
    let policyMs = 0;
    const start = performance.now();
    for (let k = 0; k < steps; k++) {
      if (k % substeps === 0) {
        const q = data.qpos as Float64Array;
        const v = data.qvel as Float64Array;
        for (let i = 0; i < 48; i++) obs[i] = i < 19 ? q[i] : v[(i - 19) % 18];
        const p0 = performance.now();
        const a = policy(obs);
        policyMs += performance.now() - p0;
        const ctrl = data.ctrl as Float64Array;
        for (let j = 0; j < 12; j++) ctrl[j] = home[j] + 0.1 * a[j];
      }
      mujoco.mj_step(model, data);
    }
    const wall = (performance.now() - start) / 1000;
    const r = { timestep: dt, steps, wallSeconds: wall, realTimeFactor: SIM_SECONDS / wall, policyShare: policyMs / 1000 / wall, trunkHeight: (data.qpos as Float64Array)[2] };
    results[terrain] = r;
    say(`${terrain}: ${JSON.stringify(r)}`);
    data.delete();
    model.delete();
  }
  const pass = Object.values(results).every((r) => (r as { realTimeFactor: number }).realTimeFactor >= 1);
  const a3 = await runA3(mujoco);
  const out = { criterion: 'A1: at least 1.0x real time with a policy-sized MLP at 50 Hz', pass, userAgent: navigator.userAgent, results, a3 };
  (window as unknown as { spikeResult: unknown }).spikeResult = out;
  say(`A1 ${pass ? 'PASS' : 'FAIL'}`);
}

/**
 * Spike A3, when the policy exported by the Colab notebook is present (../go1/go1-policy.json): the
 * TypeScript policy against JAX's recorded actions, then 10 episodes of 20 s with a forward command of
 * 0.5 m/s, on flat ground (the criterion) and on rough terrain (reported).
 */
async function runA3(mujoco: MainModule): Promise<unknown> {
  const res = await fetch(new URL('../go1/go1-policy.json', location.href));
  if (!res.ok) {
    say('A3: no exported policy yet (../go1/go1-policy.json), skipped');
    return null;
  }
  const exp = (await res.json()) as BraxPolicyExport & { constants?: Go1Constants; pairs: Array<{ state: number[]; action: number[] }> };
  const policy = new BraxPolicy(exp);
  let worst = 0;
  for (const p of exp.pairs) {
    const a = policy.act(p.state);
    p.action.forEach((v, k) => (worst = Math.max(worst, Math.abs(v - a[k]))));
  }
  say(`A3 equivalence: max |TS − JAX| = ${worst.toExponential(2)} over ${exp.pairs.length} recorded observations`);
  const constants = { ...GO1_DEFAULTS, ...(exp.constants ?? {}) };
  const command = [0.5, 0, 0];
  const out: Record<string, unknown> = { equivalenceMaxAbs: worst };
  for (const terrain of ['flat', 'rough']) {
    const model = mujoco.MjModel.from_xml_path(`/go1/scene_mjx_feetonly_${terrain}_terrain.xml`);
    const data = new mujoco.MjData(model);
    const task = new Go1Task(mujoco, model, data, constants);
    const episodes = [];
    const obs = new Float64Array(48);
    for (let ep = 0; ep < 10; ep++) {
      task.reset(1000 + ep);
      const [hx, hy] = task.heading();
      const q = data.qpos as Float64Array;
      const [x0, y0] = [q[0], q[1]];
      let fell = false;
      let t = 0;
      for (; t < Math.round(20 / constants.ctrl_dt); t++) {
        task.act(policy.act(task.observe(command, obs)));
        if (task.fell()) {
          fell = true;
          break;
        }
      }
      const forward = ((data.qpos as Float64Array)[0] - x0) * hx + ((data.qpos as Float64Array)[1] - y0) * hy;
      episodes.push({ seed: 1000 + ep, fell, seconds: (t + 1) * constants.ctrl_dt, forward });
    }
    const falls = episodes.filter((e) => e.fell).length;
    const speed = episodes.reduce((a, e) => a + e.forward / 20, 0) / episodes.length;
    out[terrain] = { falls, meanForwardSpeed: speed, episodes };
    say(`A3 ${terrain}: ${falls} falls in 10, mean forward speed ${speed.toFixed(3)} m/s`);
    data.delete();
    model.delete();
  }
  const flat = out.flat as { falls: number; meanForwardSpeed: number };
  out.pass = worst <= 1e-4 && flat.falls <= 1 && flat.meanForwardSpeed >= 0.35;
  say(`A3 ${out.pass ? 'PASS' : 'FAIL'}`);
  return out;
}

main().catch((err) => {
  say(`Error: ${String(err)}`);
  (window as unknown as { spikeResult: unknown }).spikeResult = { error: String(err) };
});
