/**
 * 3D view of the Go1 policy's live forward pass (48 → 512 → 256 → 128 → 12), in the style of the System
 * One network view: inputs grouped by what they measure, hidden layers as square grids lit by their
 * activations, the 12 joint targets laid out as legs × joints, and only the strongest connections.
 * While a hand-written jump drives the motors, the network is not used and the view dims.
 */
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { cssVar } from '../../charts';

type Three = typeof THREE;
type Dense = { readonly w: Float64Array; readonly n: number; readonly m: number };

/** The observation of Playground's Go1 joystick task, in order (see go1-controller.ts). */
const INPUT_GROUPS = [
  { name: 'body velocity', n: 3 },
  { name: 'turn rate', n: 3 },
  { name: 'gravity (tilt)', n: 3 },
  { name: 'joint angles', n: 12 },
  { name: 'joint speeds', n: 12 },
  { name: 'last action', n: 12 },
  { name: 'command', n: 3 },
];
/** Actuator order: four legs, three joints each. */
const LEGS = ['front right', 'front left', 'rear right', 'rear left'];
const LAYER_X = [-6, -3, 0, 3, 6];
/** Connections drawn per transition, and how many of the most active source neurons are searched. */
const EDGES = [60, 70, 50, 40];
const SOURCES = [48, 32, 32, 32];
const WARM = '#e8793a';
const COOL = '#3a86e8';

function opaque(css: string): string {
  const v = css.trim();
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/i.exec(v.replace(/\s+/g, ''));
  if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
  return v || '#888888';
}

/**
 * The `k` largest |w_ji · a_i| of a dense layer, searched among the `sources` most active inputs (exact
 * when `sources` covers the layer; otherwise it skips weak sources, which keeps it fast enough to redraw
 * several times a second).
 */
function topEdges(d: Dense, act: Float64Array, k: number, sources: number): Array<{ from: number; to: number; value: number }> {
  const order = Array.from({ length: d.m }, (_, i) => i)
    .sort((a, b) => Math.abs(act[b]) - Math.abs(act[a]))
    .slice(0, sources);
  const all: Array<{ from: number; to: number; value: number }> = [];
  for (const i of order) {
    if (act[i] === 0) continue;
    for (let j = 0; j < d.n; j++) all.push({ from: i, to: j, value: d.w[j * d.m + i] * act[i] });
  }
  all.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  return all.slice(0, k);
}

export class Go1NetworkView {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private layers: THREE.InstancedMesh[] = [];
  private positions: THREE.Vector3[][] = [];
  private edges!: THREE.LineSegments;
  private labels: Array<{ div: HTMLDivElement; at: THREE.Vector3; side: 'left' | 'right' }> = [];
  private runningMax = [1, 1, 1];
  private extent = 1;
  private visible = true;
  private running = false;

  private constructor(
    private readonly T: Three,
    private readonly container: HTMLElement,
    private readonly dense: ReadonlyArray<Dense>,
  ) {}

  /** Creates the view, or returns null (after showing a message) if WebGL is unavailable. */
  static async create(container: HTMLElement, dense: ReadonlyArray<Dense>): Promise<Go1NetworkView | null> {
    const T = await import('three');
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
    const view = new Go1NetworkView(T, container, dense);
    try {
      view.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      container.insertAdjacentHTML('beforeend', '<p class="fallback">3D view unavailable: this browser could not start WebGL.</p>');
      return null;
    }
    view.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    container.append(view.renderer.domElement);
    view.scene = new T.Scene();
    view.camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    view.camera.position.set(2.2, 1.6, 10);
    view.controls = new OrbitControls(view.camera, view.renderer.domElement);
    view.controls.enableDamping = true;
    view.controls.autoRotate = true;
    view.controls.autoRotateSpeed = 0.5;
    view.controls.enablePan = false;
    view.controls.minDistance = 5;
    view.controls.maxDistance = 35;
    view.controls.addEventListener('start', () => (view.controls.autoRotate = false));
    view.scene.add(new T.AmbientLight(0xffffff, 0.9));
    const light = new T.DirectionalLight(0xffffff, 0.8);
    light.position.set(3, 5, 8);
    view.scene.add(light);
    view.build();
    new ResizeObserver(() => view.resize()).observe(container);
    new IntersectionObserver((entries) => {
      view.visible = entries.some((e) => e.isIntersecting);
      view.loop();
    }).observe(container);
    document.addEventListener('visibilitychange', () => view.loop());
    view.resize();
    return view;
  }

  private label(text: string, at: THREE.Vector3, side: 'left' | 'right'): void {
    const div = document.createElement('div');
    div.className = 'net-label';
    div.textContent = text;
    this.container.append(div);
    this.labels.push({ div, at, side });
  }

  private build(): void {
    const { T } = this;
    const grid = (n: number, cols: number, x: number, gap: number) =>
      Array.from({ length: n }, (_, k) => {
        const rows = Math.ceil(n / cols);
        const r = Math.floor(k / cols);
        const c = k % cols;
        return new T.Vector3(x, ((rows - 1) / 2 - r) * gap, (c - (cols - 1) / 2) * gap);
      });

    // Inputs: each group in rows of three (one row per leg for the 12-value groups), a gap between groups.
    const rowGap = 0.3;
    const groupGap = 0.35;
    const rows = INPUT_GROUPS.reduce((a, g) => a + g.n / 3, 0);
    const height = (rows - INPUT_GROUPS.length) * rowGap + (INPUT_GROUPS.length - 1) * groupGap;
    let y = height / 2;
    const inputs: THREE.Vector3[] = [];
    for (const g of INPUT_GROUPS) {
      const first = inputs.length;
      for (let r = 0; r < g.n / 3; r++) {
        for (let c = 0; c < 3; c++) inputs.push(new T.Vector3(LAYER_X[0], y, (c - 1) * rowGap));
        y -= rowGap;
      }
      y += rowGap - groupGap;
      this.label(g.name, inputs[first].clone().setZ(-rowGap), 'left');
    }

    const [h1, h2, h3] = this.dense.slice(0, 3).map((d) => d.n);
    const outputs = grid(12, 3, LAYER_X[4], 0.6);
    LEGS.forEach((leg, k) => this.label(leg, outputs[3 * k + 2], 'right'));
    this.positions = [
      inputs,
      grid(h1, Math.ceil(Math.sqrt(h1)), LAYER_X[1], 0.2),
      grid(h2, Math.ceil(Math.sqrt(h2)), LAYER_X[2], 0.26),
      grid(h3, Math.ceil(Math.sqrt(h3)), LAYER_X[3], 0.3),
      outputs,
    ];
    this.extent = Math.max(...this.positions.flat().map((p) => Math.max(Math.abs(p.y), Math.abs(p.z))));

    const sizes = [0.08, 0.06, 0.07, 0.08, 0.12];
    this.positions.forEach((pos, l) => {
      const mesh = new T.InstancedMesh(new T.SphereGeometry(sizes[l], 12, 8), new T.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }), pos.length);
      const m = new T.Matrix4();
      pos.forEach((p, k) => {
        mesh.setMatrixAt(k, m.makeTranslation(p.x, p.y, p.z));
        mesh.setColorAt(k, new T.Color(0x888888));
      });
      this.scene.add(mesh);
      this.layers.push(mesh);
    });

    const max = EDGES.reduce((a, b) => a + b, 0);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(max * 6), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(max * 6), 3));
    this.edges = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.scene.add(this.edges);
  }

  /**
   * Draws one forward pass: `trace` holds the normalized input, the three hidden layers and the raw outputs
   * (the first 12 are the joint targets before tanh). With `idle`, the network is not driving: all dim.
   */
  update(trace: readonly Float64Array[], idle: boolean): void {
    const { T } = this;
    const root = document.documentElement;
    const color = (v: string) => new T.Color(opaque(cssVar(root, v)));
    const dim = color('--panel-edge').lerp(color('--ink-3'), 0.25);
    const lit = color('--s1');
    const warm = new T.Color(WARM);
    const cool = new T.Color(COOL);
    const signed = (v: number) => dim.clone().lerp(v >= 0 ? warm : cool, Math.min(1, Math.abs(v)));

    const [input, a1, a2, a3, out] = trace;
    const inMesh = this.layers[0];
    for (let k = 0; k < inMesh.count; k++) inMesh.setColorAt(k, idle ? dim : signed(input[k] / 2));
    [a1, a2, a3].forEach((act, l) => {
      const mesh = this.layers[l + 1];
      let peak = 1e-6;
      for (const v of act) peak = Math.max(peak, v);
      this.runningMax[l] = Math.max(peak, this.runningMax[l] * 0.98);
      for (let k = 0; k < act.length; k++) mesh.setColorAt(k, idle ? dim : dim.clone().lerp(lit, Math.max(0, Math.min(1, act[k] / this.runningMax[l]))));
    });
    // Outputs: the joint targets (tanh of the first 12 outputs), sized and coloured by value.
    const outMesh = this.layers[4];
    const m = new T.Matrix4();
    for (let k = 0; k < 12; k++) {
      const a = Math.tanh(out[k]);
      const s = idle ? 0.8 : 0.8 + 1.2 * Math.abs(a);
      outMesh.setMatrixAt(k, m.makeScale(s, s, s).setPosition(this.positions[4][k]));
      outMesh.setColorAt(k, idle ? dim : signed(a));
    }
    outMesh.instanceMatrix.needsUpdate = true;
    for (const mesh of this.layers) mesh.instanceColor!.needsUpdate = true;

    const pos = this.edges.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.edges.geometry.getAttribute('color') as THREE.BufferAttribute;
    let v = 0;
    if (!idle) {
      [input, a1, a2, a3].forEach((act, l) => {
        const d = l < 3 ? this.dense[l] : { ...this.dense[3], n: 12 }; // only the joint targets' outputs
        const list = topEdges(d, act, EDGES[l], SOURCES[l]);
        const max = Math.max(...list.map((c) => Math.abs(c.value)), 1e-9);
        for (const c of list) {
          const tint = dim.clone().lerp(c.value >= 0 ? warm : cool, 0.25 + 0.75 * (Math.abs(c.value) / max));
          for (const p of [this.positions[l][c.from], this.positions[l + 1][c.to]]) {
            pos.setXYZ(v, p.x, p.y, p.z);
            col.setXYZ(v, tint.r, tint.g, tint.b);
            v++;
          }
        }
      });
    }
    this.edges.geometry.setDrawRange(0, v);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.loop();
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Wider than tall: step back on narrow panels so the whole network stays in frame.
    this.camera.position.setLength(13.5 * Math.max(1, 2.2 / this.camera.aspect) * Math.max(1, this.extent / 3.4));
    this.loop();
  }

  /** Renders while visible; stops when off-screen or the tab is hidden. */
  private loop(): void {
    if (this.running || !this.visible || document.hidden) return;
    this.running = true;
    const tick = () => {
      if (!this.visible || document.hidden) {
        this.running = false;
        return;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.placeLabels();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Projects the labelled nodes to screen space for their HTML labels. */
  private placeLabels(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const { div, at, side } of this.labels) {
      const p = at.clone().project(this.camera);
      const x = ((p.x + 1) / 2) * w;
      const left = side === 'left' ? x - 12 - div.offsetWidth : x + 12;
      div.style.transform = `translate(${left}px, ${((1 - p.y) / 2) * h - 6}px)`;
      div.style.visibility = p.z < 1 ? 'visible' : 'hidden';
    }
  }
}
