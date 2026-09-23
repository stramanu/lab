import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Mlp } from '../src/nn/mlp';
import { cssVar } from './charts';
import type { InputLayout } from './games';
import { topContributions } from './network-math';

type Three = typeof THREE;

export interface NetworkFrame {
  trace: { input: Float64Array; h1: Float64Array; h2: Float64Array; logits: Float64Array };
  probs: ArrayLike<number>;
  chosen: number;
  threshold: number;
  /** CSS variable of the decider's color (--s1, --guard, --s2). */
  deciderVar: string;
}

const EDGES = { in: 120, h1: 120, h2: 24 };

/** CSS colors may carry alpha (#rrggbbaa, rgba()); THREE.Color only takes opaque colors. */
function opaque(css: string): string {
  const v = css.trim();
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/i.exec(v.replace(/\s+/g, ''));
  if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
  return v || '#888888';
}
const LAYER_X = [-4.2, -1.4, 1.4, 4.2];

/**
 * 3D view of System One's live forward pass: input layout per game, hidden
 * layers as 8×8 grids lit by their activations, outputs sized by probability,
 * and only the connections with the largest |weight × activation|.
 */
export class NetworkView {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private layers: THREE.InstancedMesh[] = [];
  private positions: THREE.Vector3[][] = [];
  private edges!: THREE.LineSegments;
  private ring!: THREE.Mesh;
  private labels: HTMLDivElement[] = [];
  private visible = true;
  private running = false;
  private runningMax = [1, 1];
  private net: Mlp | null = null;
  private actionNames: readonly string[] = [];

  private constructor(
    private readonly T: Three,
    private readonly container: HTMLElement,
  ) {}

  /** Creates the view, or returns null (after showing a message) if WebGL is unavailable. */
  static async create(container: HTMLElement): Promise<NetworkView | null> {
    const T = await import('three');
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
    const view = new NetworkView(T, container);
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
    view.camera.position.set(1.8, 1.4, 8.2);
    view.controls = new OrbitControls(view.camera, view.renderer.domElement);
    view.controls.enableDamping = true;
    view.controls.autoRotate = true;
    view.controls.autoRotateSpeed = 0.6;
    view.controls.enablePan = false;
    view.controls.minDistance = 4;
    view.controls.maxDistance = 30;
    view.controls.addEventListener('start', () => (view.controls.autoRotate = false));
    view.scene.add(new T.AmbientLight(0xffffff, 0.9));
    const light = new T.DirectionalLight(0xffffff, 0.8);
    light.position.set(3, 5, 8);
    view.scene.add(light);

    new ResizeObserver(() => view.resize()).observe(container);
    new IntersectionObserver((entries) => {
      view.visible = entries.some((e) => e.isIntersecting);
      view.loop();
    }).observe(container);
    document.addEventListener('visibilitychange', () => view.loop());
    view.resize();
    return view;
  }

  /** Rebuilds the scene for a network and its input layout. */
  setModel(net: Mlp, layout: InputLayout, actionNames: readonly string[]): void {
    const T = this.T;
    this.net = net;
    this.actionNames = actionNames;
    for (const m of this.layers) this.scene.remove(m);
    if (this.edges) this.scene.remove(this.edges);
    if (this.ring) this.scene.remove(this.ring);
    for (const l of this.labels) l.remove();
    this.layers = [];
    this.positions = [];
    this.labels = [];
    this.runningMax = [1, 1];

    // Node positions per layer, in the y–z plane at the layer's x.
    const grid = (n: number, cols: number, x: number, gap: number) =>
      Array.from({ length: n }, (_, k) => {
        const r = Math.floor(k / cols);
        const c = k % cols;
        const rows = Math.ceil(n / cols);
        return new T.Vector3(x, ((rows - 1) / 2 - r) * gap, (c - (cols - 1) / 2) * gap);
      });
    let inputs: THREE.Vector3[];
    if (layout.kind === 'window') {
      // One node per window cell, extras in a row below the plane.
      const cells = grid(layout.side * layout.side, layout.side, LAYER_X[0], 0.42);
      const extras = Array.from({ length: layout.extras }, (_, k) => new T.Vector3(LAYER_X[0], -((layout.side + 1) / 2) * 0.42 - 0.3, (k - (layout.extras - 1) / 2) * 0.42));
      inputs = [...cells, ...extras];
    } else {
      inputs = layout.labels.map((_, k) => new T.Vector3(LAYER_X[0], ((layout.labels.length - 1) / 2 - k) * 0.2, 0));
    }
    const { hidden, outputSize } = net.config;
    this.positions = [
      inputs,
      grid(hidden[0], Math.ceil(Math.sqrt(hidden[0])), LAYER_X[1], 0.34),
      grid(hidden[1], Math.ceil(Math.sqrt(hidden[1])), LAYER_X[2], 0.34),
      Array.from({ length: outputSize }, (_, k) => new T.Vector3(LAYER_X[3], ((outputSize - 1) / 2 - k) * 0.9, 0)),
    ];
    const sizes = [0.09, 0.07, 0.07, 0.16];
    this.positions.forEach((pos, l) => {
      const mesh = new T.InstancedMesh(new T.SphereGeometry(sizes[l], 14, 10), new T.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }), pos.length);
      const m = new T.Matrix4();
      pos.forEach((p, k) => mesh.setMatrixAt(k, m.makeTranslation(p.x, p.y, p.z)));
      for (let k = 0; k < pos.length; k++) mesh.setColorAt(k, new T.Color(0x888888));
      this.scene.add(mesh);
      this.layers.push(mesh);
    });

    const maxEdges = EDGES.in + EDGES.h1 + EDGES.h2;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(maxEdges * 6), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(maxEdges * 6), 3));
    this.edges = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.scene.add(this.edges);

    this.ring = new T.Mesh(new T.TorusGeometry(0.3, 0.025, 8, 40), new T.MeshBasicMaterial({ color: 0xffffff }));
    this.ring.rotation.y = Math.PI / 2;
    this.scene.add(this.ring);

    for (let k = 0; k < outputSize; k++) {
      const div = document.createElement('div');
      div.className = 'net-label';
      this.container.append(div);
      this.labels.push(div);
    }
  }

  /** Updates colors, sizes and edges for one decision. */
  update(frame: NetworkFrame, layout: InputLayout): void {
    if (!this.net || !this.layers.length) return;
    const T = this.T;
    const root = document.documentElement;
    const color = (v: string) => new T.Color(opaque(cssVar(root, v)));
    const dim = color('--panel-edge').lerp(color('--ink-3'), 0.25);
    const lit = color('--s1');
    const warm = new T.Color('#e8793a');
    const cool = new T.Color('#3a86e8');
    const { input, h1, h2 } = frame.trace;

    // Input layer.
    const inMesh = this.layers[0];
    if (layout.kind === 'window') {
      const cells = layout.side * layout.side;
      const channelColors = layout.channelVars.map(color);
      for (let k = 0; k < cells; k++) {
        let ch = 0;
        for (let q = 0; q < layout.channels; q++) if (input[k * layout.channels + q] > 0.5) ch = q;
        inMesh.setColorAt(k, channelColors[ch].clone());
      }
      for (let e = 0; e < layout.extras; e++) {
        const v = Math.min(1, Math.abs(input[cells * layout.channels + e]) * 3);
        inMesh.setColorAt(cells + e, dim.clone().lerp(lit, v));
      }
    } else {
      for (let k = 0; k < input.length; k++) {
        const v = Math.min(1, Math.abs(input[k]));
        inMesh.setColorAt(k, dim.clone().lerp(input[k] >= 0 ? warm : cool, v));
      }
    }
    inMesh.instanceColor!.needsUpdate = true;

    // Hidden layers, normalized by a slowly decaying running max.
    [h1, h2].forEach((act, l) => {
      const peak = Math.max(...act, 1e-6);
      this.runningMax[l] = Math.max(peak, this.runningMax[l] * 0.98);
      const mesh = this.layers[l + 1];
      for (let k = 0; k < act.length; k++) mesh.setColorAt(k, dim.clone().lerp(lit, Math.min(1, act[k] / this.runningMax[l])));
      mesh.instanceColor!.needsUpdate = true;
    });

    // Outputs: size by probability, the chosen action ringed in the decider's color.
    const out = this.layers[3];
    const m = new T.Matrix4();
    const decider = color(frame.deciderVar);
    for (let k = 0; k < out.count; k++) {
      const p = this.positions[3][k];
      const s = 0.6 + 1.6 * frame.probs[k];
      out.setMatrixAt(k, m.makeScale(s, s, s).setPosition(p));
      out.setColorAt(k, k === frame.chosen ? decider.clone() : dim.clone());
    }
    out.instanceMatrix.needsUpdate = true;
    out.instanceColor!.needsUpdate = true;
    const cp = this.positions[3][frame.chosen];
    this.ring.position.copy(cp);
    (this.ring.material as THREE.MeshBasicMaterial).color = decider;
    this.labels.forEach((div, k) => {
      div.textContent = `${this.actionNames[k]} ${Number(frame.probs[k]).toFixed(2)}`;
      div.dataset.chosen = String(k === frame.chosen);
    });

    // Strongest contributions for each transition.
    const { params, offsets, config } = this.net;
    const [n1, n2] = config.hidden;
    const groups = [
      { list: topContributions(params, offsets.w1, config.inputSize, n1, input, EDGES.in), from: 0 },
      { list: topContributions(params, offsets.w2, n1, n2, h1, EDGES.h1), from: 1 },
      { list: topContributions(params, offsets.w3, n2, config.outputSize, h2, EDGES.h2), from: 2 },
    ];
    const pos = this.edges.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.edges.geometry.getAttribute('color') as THREE.BufferAttribute;
    let v = 0;
    const cellOf = (i: number) => (layout.kind === 'window' && i < layout.side * layout.side * layout.channels ? Math.floor(i / layout.channels) : layout.kind === 'window' ? layout.side * layout.side + (i - layout.side * layout.side * layout.channels) : i);
    for (const g of groups) {
      const max = Math.max(...g.list.map((c) => Math.abs(c.value)), 1e-9);
      for (const c of g.list) {
        const a = this.positions[g.from][g.from === 0 ? cellOf(c.from) : c.from];
        const b = this.positions[g.from + 1][c.to];
        const tint = dim.clone().lerp(c.value >= 0 ? warm : cool, 0.25 + 0.75 * (Math.abs(c.value) / max));
        for (const p of [a, b]) {
          pos.setXYZ(v, p.x, p.y, p.z);
          col.setXYZ(v, tint.r, tint.g, tint.b);
          v++;
        }
      }
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
    // The network is wider than tall: step back on narrow panels so it stays in frame.
    this.camera.position.setLength(8.6 * Math.max(1, 1.9 / this.camera.aspect));
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

  /** Projects the output nodes to screen space for their HTML labels. */
  private placeLabels(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.labels.forEach((div, k) => {
      const p = this.positions[3]?.[k]?.clone().project(this.camera);
      if (!p) return;
      const x = ((p.x + 1) / 2) * w;
      // Put the label on the left of the node when it would overflow the panel.
      const left = x + 14 + div.offsetWidth > w ? x - 14 - div.offsetWidth : x + 14;
      div.style.transform = `translate(${left}px, ${((1 - p.y) / 2) * h - 8}px)`;
      div.style.visibility = 'visible';
    });
  }
}
