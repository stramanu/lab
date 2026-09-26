/**
 * 3D view of the Go1 policy's live forward pass (48 → 512 → 256 → 128 → 12), in the style of the System
 * One network view: inputs grouped by what they measure, hidden layers as square grids lit by their
 * activations, the 12 joint targets laid out as legs × joints, and every connection (about 190,000), each
 * as bright as its contribution |weight × activation| to this forward pass.
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
const LEGS_SHORT = ['FR', 'FL', 'RR', 'RL'];
/** Below this width/height ratio the network is laid out top to bottom (phones held upright). */
const PORTRAIT = 0.9;
const LAYER_X = [-6, -3, 0, 3, 6];
/**
 * Edge opacity: the contribution relative to SCALE × the layer's mean contribution, raised to GAMMA, so every
 * layer shows its structure whatever its typical magnitude.
 */
const SCALE = 8;
const GAMMA = 1.5;
/**
 * Adaptive quality: the view starts at the screen's full resolution, redrawing at most every 33 ms. When the
 * page's frame interval grows well past the one measured before the view appeared, it steps down, one
 * level per 2 s window: lower resolutions first, then fewer redraws. 190,000 blended lines are cheap on a
 * laptop GPU and heavy on a small one.
 */
const DPR = Math.min(globalThis.devicePixelRatio || 1, 3);
const QUALITY = [
  { ratio: DPR, frameMs: 33 },
  { ratio: Math.min(DPR, 2), frameMs: 33 },
  { ratio: Math.min(DPR, 1.5), frameMs: 33 },
  { ratio: 1, frameMs: 33 },
  { ratio: 1, frameMs: 66 },
].filter((q, i, all) => i === 0 || q.ratio !== all[i - 1].ratio || q.frameMs !== all[i - 1].frameMs);
const WINDOW_MS = 2000;
const WARM = '#e8793a';
const COOL = '#3a86e8';

function opaque(css: string): string {
  const v = css.trim();
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/i.exec(v.replace(/\s+/g, ''));
  if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
  return v || '#888888';
}

export class Go1NetworkView {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private layers: THREE.InstancedMesh[] = [];
  private positions: THREE.Vector3[][] = [];
  private edges!: THREE.LineSegments;
  /** Every node and edge, turned by −90° about z in portrait so the layers run top to bottom. */
  private root!: THREE.Group;
  private portrait = false;
  private labels: Array<{ div: HTMLDivElement; at: THREE.Vector3; side: 'left' | 'right'; text: string; short: string | null }> = [];
  private runningMax = [1, 1, 1];
  /** Per transition: the dense layer, its number of targets drawn, and the first edge's index. */
  private transitions: Array<{ d: Dense; n: number; first: number }> = [];
  private extent = 1;
  private visible = true;
  private running = false;
  private quality = 0;
  /** The page's frame interval (ms) before the view was drawn, the reference for slowdowns. */
  private baseFrame = 1000 / 60;

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
    view.renderer.setPixelRatio(QUALITY[0].ratio);
    container.append(view.renderer.domElement);
    view.scene = new T.Scene();
    view.camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    view.camera.position.set(2.2, 1.6, 10);
    view.controls = new OrbitControls(view.camera, view.renderer.domElement);
    view.controls.enableDamping = true;
    view.controls.autoRotate = true;
    view.controls.autoRotateSpeed = 1; // per update, at ~30 updates a second
    view.controls.enablePan = false;
    view.controls.minDistance = 5;
    view.controls.maxDistance = 60;
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
    await view.measureBase();
    return view;
  }

  /** A node label; in portrait, `short` replaces the text, and labels without one are hidden. */
  private label(text: string, at: THREE.Vector3, side: 'left' | 'right', short: string | null = null): void {
    const div = document.createElement('div');
    div.className = 'net-label';
    div.textContent = text;
    this.container.append(div);
    this.labels.push({ div, at, side, text, short });
  }

  private build(): void {
    const { T } = this;
    this.root = new T.Group();
    this.scene.add(this.root);
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
    LEGS.forEach((leg, k) => this.label(leg, outputs[3 * k + 2], 'right', LEGS_SHORT[k]));
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
      this.root.add(mesh);
      this.layers.push(mesh);
    });

    // Every connection, positioned once; each update only rewrites the colours (RGBA).
    let total = 0;
    this.transitions = this.dense.map((d, l) => {
      const n = l === this.dense.length - 1 ? 12 : d.n; // the last layer's other half is the action noise scale
      const t = { d, n, first: total };
      total += d.m * n;
      return t;
    });
    const position = new Float32Array(total * 6);
    let v = 0;
    this.transitions.forEach(({ d, n }, l) => {
      for (let i = 0; i < d.m; i++) {
        const a = this.positions[l][i];
        for (let j = 0; j < n; j++) {
          const b = this.positions[l + 1][j];
          position.set([a.x, a.y, a.z, b.x, b.y, b.z], v);
          v += 6;
        }
      }
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(position, 3));
    geo.setAttribute('color', new T.BufferAttribute(new Uint8Array(total * 8), 4, true).setUsage(T.DynamicDrawUsage));
    this.edges = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.root.add(this.edges);
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

    const col = this.edges.geometry.getAttribute('color') as THREE.BufferAttribute;
    const rgba = col.array as Uint8Array;
    const byte = (c: THREE.Color) => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
    const [wr, wg, wb] = byte(warm);
    const [cr, cg, cb] = byte(cool);
    const [dr, dg, db] = byte(dim);
    [input, a1, a2, a3].forEach((act, l) => {
      const { d, n, first } = this.transitions[l];
      const w = d.w;
      const m = d.m;
      let sum = 0;
      if (!idle) for (let i = 0; i < m; i++) { const a = Math.abs(act[i]); for (let j = 0; j < n; j++) sum += Math.abs(w[j * m + i]) * a; }
      const inv = (m * n) / (SCALE * Math.max(sum, 1e-9));
      let o = first * 8;
      for (let i = 0; i < m; i++) {
        const a = act[i];
        for (let j = 0; j < n; j++) {
          const value = w[j * m + i] * a;
          let r = dr, g = dg, b = db, alpha = 3;
          if (!idle) {
            const t = Math.min(1, Math.abs(value) * inv);
            alpha = Math.round(255 * t ** GAMMA);
            if (value >= 0) (r = wr), (g = wg), (b = wb);
            else (r = cr), (g = cg), (b = cb);
          }
          rgba[o] = rgba[o + 4] = r;
          rgba[o + 1] = rgba[o + 5] = g;
          rgba[o + 2] = rgba[o + 6] = b;
          rgba[o + 3] = rgba[o + 7] = alpha;
          o += 8;
        }
      }
    });
    col.needsUpdate = true;
    this.loop();
  }

  /** The current quality level (0 = full resolution) and its pixel ratio, for automated checks. */
  get qualityState(): { level: number; ratio: number; baseFrame: number } {
    return { level: this.quality, ratio: QUALITY[this.quality].ratio, baseFrame: this.baseFrame };
  }

  /** The page's mean frame interval over one second, before this view renders anything. */
  private measureBase(): Promise<void> {
    return new Promise((done) => {
      const t0 = performance.now();
      let frames = 0;
      const tick = (now: number) => {
        frames++;
        if (now - t0 < 1000) return void requestAnimationFrame(tick);
        this.baseFrame = (now - t0) / frames;
        done();
      };
      requestAnimationFrame(tick);
    });
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.portrait = this.camera.aspect < PORTRAIT;
    this.root.rotation.z = this.portrait ? -Math.PI / 2 : 0;
    this.root.updateMatrixWorld();
    for (const l of this.labels) l.div.textContent = this.portrait && l.short ? l.short : l.text;
    // Step back just enough for the whole network to fit the frame: 7 either side along the layers, plus
    // room for the side labels in landscape.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const [hx, hy] = this.portrait ? [this.extent + 0.4, 7] : [9, this.extent + 0.4];
    const fit = Math.max(hy / tan, hx / (tan * this.camera.aspect));
    this.camera.position.setLength(Math.min(this.controls.maxDistance, 1.12 * fit + 1));
    this.loop();
  }

  /** Renders while visible; stops when off-screen or the tab is hidden. */
  private loop(): void {
    if (this.running || !this.visible || document.hidden) return;
    this.running = true;
    let last = 0;
    let prev = 0;
    let windowStart = 0;
    let sum = 0;
    let frames = 0;
    const tick = (now: number) => {
      if (!this.visible || document.hidden) {
        this.running = false;
        return;
      }
      requestAnimationFrame(tick);
      if (prev) {
        sum += now - prev;
        frames++;
      } else windowStart = now;
      prev = now;
      if (now - windowStart > WINDOW_MS) {
        const mean = sum / frames;
        if (mean > Math.max(1.3 * this.baseFrame, this.baseFrame + 5) && this.quality < QUALITY.length - 1) {
          this.quality++;
          this.renderer.setPixelRatio(QUALITY[this.quality].ratio);
          this.resize();
        }
        windowStart = now;
        sum = frames = 0;
      }
      if (now - last < QUALITY[this.quality].frameMs) return;
      last = now;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.placeLabels();
    };
    requestAnimationFrame(tick);
  }

  /** Projects the labelled nodes to screen space for their HTML labels. */
  private placeLabels(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const upright: Array<{ div: HTMLDivElement; x: number }> = [];
    for (const { div, at, side, short } of this.labels) {
      const p = this.root.localToWorld(at.clone()).project(this.camera);
      const x = ((p.x + 1) / 2) * w;
      const y = ((1 - p.y) / 2) * h;
      if (this.portrait) {
        // Upright: the legs' short names sit under the outputs; the input groups are described in the text.
        div.style.transform = `translate(${x - div.offsetWidth / 2}px, ${y + 12}px)`;
        div.style.visibility = short && p.z < 1 ? 'visible' : 'hidden';
        if (short) upright.push({ div, x });
        continue;
      }
      const left = side === 'left' ? x - 12 - div.offsetWidth : x + 12;
      div.style.transform = `translate(${left}px, ${y - 6}px)`;
      div.style.visibility = p.z < 1 ? 'visible' : 'hidden';
    }
    // Too close to read (a short view, or seen edge-on while orbiting): hide them all rather than overlap.
    upright.sort((a, b) => a.x - b.x);
    const crowded = upright.some((l, n) => n > 0 && l.x - upright[n - 1].x < l.div.offsetWidth + 4);
    if (crowded) for (const l of upright) l.div.style.visibility = 'hidden';
  }
}
