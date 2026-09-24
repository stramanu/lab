import type * as THREE from 'three';
import type { Env } from '../src/core/types';
import { pushTrunk, type Push, type QuadrupedEnv } from '../src/games/quadruped';
import { cssVar } from './charts';
import { STATE_VAR, type BoardView, type DecisionState } from './game-view';

type Three = typeof THREE;

/** Footprints kept on the ground (the most recent touchdowns, colored by who decided). */
const FOOTPRINTS = 80;
/** Seconds a push arrow stays visible. */
const PUSH_SHOWN = 0.7;
/** Visitor pushes: impulse per metre dragged on the ground, and the cap (N·s). */
const DRAG_GAIN = 25;
const DRAG_MAX = 14;

/** A thick arrow (cylinder shaft and cone head) lying along +x, scaled and turned by `aim`. */
function makeArrow(T: Three, color: string): THREE.Group {
  const mat = new T.MeshBasicMaterial({ color });
  const shaft = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1, 10), mat);
  shaft.rotation.z = -Math.PI / 2;
  shaft.name = 'shaft';
  const head = new T.Mesh(new T.ConeGeometry(0.035, 0.08, 14), mat);
  head.rotation.z = -Math.PI / 2;
  head.name = 'head';
  const g = new T.Group();
  g.add(shaft, head);
  return g;
}

/** Points `arrow` from `origin` along `dir` (unit, horizontal) with total `length`. */
function aim(arrow: THREE.Group, origin: THREE.Vector3, dir: THREE.Vector3, length: number): void {
  const shaft = arrow.getObjectByName('shaft')!;
  const head = arrow.getObjectByName('head')!;
  shaft.scale.set(1, Math.max(0.01, length - 0.08), 1);
  shaft.position.set((length - 0.08) / 2, 0, 0);
  head.position.set(length - 0.04, 0, 0);
  arrow.position.copy(origin);
  arrow.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
}

/** Position and orientation of one body. */
interface BodyPose {
  p: [number, number, number];
  q: [number, number, number, number];
}

/**
 * 3D view of the quadruped (three.js, loaded lazily). The board's 2D canvas cannot host WebGL, so
 * the view adds its own canvas on top of it and removes it in `dispose()`. The trunk is colored
 * by who decided the last action; touchdowns leave footprints in the same colors; pushes appear
 * as fading arrows; the camera follows the robot.
 */
export class QuadrupedView implements BoardView {
  private T: Three | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private trunk!: THREE.Mesh;
  private nose!: THREE.Mesh;
  private limbs: THREE.Mesh[] = [];
  private feet: THREE.Mesh[] = [];
  private ground!: THREE.Mesh;
  private groundTexture!: THREE.CanvasTexture;
  private prints!: THREE.InstancedMesh;
  private printCount = 0;
  private arrow: THREE.Group | null = null;
  private lastPush: Push | null = null;
  private pushTime = -1;
  private contacts = [true, true, true, true];
  private readonly glCanvas: HTMLCanvasElement;
  private readonly hud: HTMLDivElement;
  private disposed = false;
  private camX = 0;
  /**
   * Poses of the 9 bodies (trunk, then thigh and shank per leg) after the previous and the latest
   * decision. The view moves between them over the typical time between decisions, so motion stays
   * continuous even when decisions arrive a few times per second (the planner is slow).
   */
  private prevPose: BodyPose[] | null = null;
  private currPose: BodyPose[] | null = null;
  private poseTime = 0;
  private poseInterval = 100;
  /** The environment last drawn (the target of the visitor's pushes), and the drag in progress. */
  private env: QuadrupedEnv | null = null;
  private dragStart: THREE.Vector3 | null = null;
  private dragArrow: THREE.Group | null = null;
  private visitorPushes = 0;

  constructor(private readonly board: HTMLCanvasElement) {
    const wrap = board.parentElement!;
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = 'board-3d';
    this.glCanvas.setAttribute('aria-label', 'Quadruped, 3D view');
    this.glCanvas.setAttribute('role', 'img');
    this.hud = document.createElement('div');
    this.hud.className = 'board-hud';
    wrap.append(this.glCanvas, this.hud);
    board.style.visibility = 'hidden';
    this.glCanvas.style.touchAction = 'none';
    this.glCanvas.style.cursor = 'grab';
    this.glCanvas.addEventListener('pointerdown', (e) => this.dragBegin(e));
    this.glCanvas.addEventListener('pointermove', (e) => this.dragMove(e));
    this.glCanvas.addEventListener('pointerup', (e) => this.dragEnd(e));
    this.glCanvas.addEventListener('pointercancel', () => this.dragCancel());
    void this.init();
  }

  private async init(): Promise<void> {
    const T = await import('three');
    if (this.disposed) return;
    try {
      this.renderer = new T.WebGLRenderer({ canvas: this.glCanvas, antialias: true });
    } catch {
      this.hud.textContent = '3D view unavailable: this browser could not start WebGL.';
      return;
    }
    this.T = T;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 4 / 3, 0.05, 60);

    const sun = new T.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-2, 5, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -2;
    sun.shadow.camera.right = sun.shadow.camera.top = 2;
    this.scene.add(sun, sun.target, new T.HemisphereLight(0xffffff, 0x888070, 1.1));
    (this.scene.userData as { sun: THREE.DirectionalLight }).sun = sun;

    // Ground: a long strip with a metre grid drawn on a canvas texture.
    this.groundTexture = new T.CanvasTexture(this.gridCanvas());
    this.groundTexture.wrapS = this.groundTexture.wrapT = T.RepeatWrapping;
    this.groundTexture.repeat.set(60, 12);
    this.groundTexture.anisotropy = 4;
    this.ground = new T.Mesh(new T.PlaneGeometry(60, 12), new T.MeshStandardMaterial({ map: this.groundTexture, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(28, 0, 0);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const mat = (color: number) => new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
    this.trunk = new T.Mesh(new T.BoxGeometry(0.5, 0.12, 0.24), mat(0x1f8a5b));
    this.nose = new T.Mesh(new T.BoxGeometry(0.04, 0.07, 0.16), mat(0x222222));
    this.nose.position.set(0.25, 0.01, 0);
    this.trunk.add(this.nose);
    this.trunk.castShadow = true;
    this.scene.add(this.trunk);
    const limb = new T.CapsuleGeometry(0.02, 0.14, 4, 10);
    for (let leg = 0; leg < 4; leg++) {
      for (let k = 0; k < 2; k++) {
        const m = new T.Mesh(limb, mat(0x3a3f46));
        m.castShadow = true;
        this.limbs.push(m);
        this.scene.add(m);
      }
      const foot = new T.Mesh(new T.SphereGeometry(0.024, 14, 10), mat(0x8a8474));
      foot.castShadow = true;
      this.feet.push(foot);
      this.scene.add(foot);
    }
    this.prints = new T.InstancedMesh(new T.CircleGeometry(0.035, 18), new T.MeshBasicMaterial({ transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }), FOOTPRINTS);
    this.prints.count = 0;
    // Instances spread along the track; the default culling uses the geometry's sphere at the origin.
    this.prints.frustumCulled = false;
    this.scene.add(this.prints);
    new ResizeObserver(() => this.resize()).observe(this.glCanvas);
    this.resize();
  }

  /** One grid cell of the ground texture: a 1 m square with a 0.25 m sub-grid, in the page's colors. */
  private gridCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = cssVar(this.board, '--board');
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = cssVar(this.board, '--board-grid');
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 256);
      g.moveTo(0, i * 64);
      g.lineTo(256, i * 64);
      g.stroke();
    }
    g.strokeStyle = cssVar(this.board, '--ink-3');
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    return c;
  }

  /** Where the pointer meets the horizontal plane at trunk height, in world coordinates. */
  private groundPoint(e: PointerEvent): THREE.Vector3 | null {
    const T = this.T;
    if (!T) return null;
    const r = this.glCanvas.getBoundingClientRect();
    const ndc = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new T.Vector3();
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -this.trunk.position.y), hit) ? hit : null;
  }

  /** The impulse a drag from `a` to `b` gives: along the drag, 25 N·s per metre, at most 14 N·s. */
  private dragImpulse(a: THREE.Vector3, b: THREE.Vector3): [number, number, number] | null {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.03) return null;
    const j = Math.min(DRAG_MAX, DRAG_GAIN * len);
    return [(dx / len) * j, 0, (dz / len) * j];
  }

  private dragBegin(e: PointerEvent): void {
    const p = this.groundPoint(e);
    if (!p || !this.env || this.env.isDone()) return;
    this.dragStart = p;
    this.glCanvas.setPointerCapture(e.pointerId);
    this.glCanvas.style.cursor = 'grabbing';
  }

  private dragMove(e: PointerEvent): void {
    const T = this.T;
    if (!T || !this.dragStart) return;
    const p = this.groundPoint(e);
    const j = p && this.dragImpulse(this.dragStart, p);
    if (!j) {
      if (this.dragArrow) this.dragArrow.visible = false;
      return;
    }
    const dir = new T.Vector3(j[0], 0, j[2]).normalize();
    const length = 0.15 + 0.03 * Math.hypot(j[0], j[2]);
    const origin = this.trunk.position.clone().addScaledVector(dir, -length - 0.14);
    if (!this.dragArrow) {
      this.dragArrow = makeArrow(T, cssVar(this.board, '--food'));
      this.scene.add(this.dragArrow);
    }
    aim(this.dragArrow, origin, dir, length);
    this.dragArrow.visible = true;
  }

  private dragEnd(e: PointerEvent): void {
    const start = this.dragStart;
    this.dragCancel();
    const p = start && this.groundPoint(e);
    const j = p && this.dragImpulse(start, p);
    const env = this.env;
    if (!j || !env?.world || !env.handles || env.isDone()) return;
    // A visitor's push: applied to the live robot now; the planner does not see it coming either.
    pushTrunk(env.world, env.handles, j);
    this.visitorPushes++;
    env.lastPush = { time: env.time, impulse: j };
    this.lastPush = env.lastPush;
    this.pushTime = env.time;
  }

  private dragCancel(): void {
    this.dragStart = null;
    if (this.dragArrow) this.dragArrow.visible = false;
    this.glCanvas.style.cursor = 'grab';
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = this.glCanvas.clientWidth;
    const h = this.glCanvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  reset(): void {
    this.prevPose = this.currPose = null;
    this.visitorPushes = 0;
    this.printCount = 0;
    if (this.prints) this.prints.count = 0;
    this.lastPush = null;
    this.contacts = [true, true, true, true];
    this.camX = 0;
    if (this.arrow) {
      this.scene.remove(this.arrow);
      this.arrow = null;
    }
    if (this.groundTexture) {
      this.groundTexture.image = this.gridCanvas();
      this.groundTexture.needsUpdate = true;
    }
  }

  private capture(e: QuadrupedEnv): BodyPose[] {
    const h = e.handles!;
    return [h.trunk, ...h.thigh.flatMap((t, leg) => [t, h.shank[leg]])].map((handle) => {
      const b = e.world!.getRigidBody(handle);
      const p = b.translation();
      const q = b.rotation();
      return { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] };
    });
  }

  record(env: Env, state: DecisionState): void {
    const e = env as QuadrupedEnv;
    if (e.world && e.handles) {
      const now = performance.now();
      if (this.currPose) this.poseInterval += (Math.min(500, now - this.poseTime) - this.poseInterval) * 0.2;
      this.prevPose = this.currPose ?? this.capture(e);
      this.currPose = this.capture(e);
      this.poseTime = now;
    }
    if (!this.T || !e.robot) return;
    // A footprint at every touchdown, in the color of whoever decided the current action.
    const color = new this.T.Color(cssVar(this.board, STATE_VAR[state]));
    const m = new this.T.Matrix4();
    e.robot.contacts.forEach((c, leg) => {
      if (c && !this.contacts[leg]) {
        const f = e.robot.feet[leg];
        const slot = this.printCount++ % FOOTPRINTS;
        m.makeRotationX(-Math.PI / 2).setPosition(f[0], 0.003, f[2]);
        this.prints.setMatrixAt(slot, m);
        this.prints.setColorAt(slot, color);
        this.prints.count = Math.min(this.printCount, FOOTPRINTS);
        this.prints.instanceMatrix.needsUpdate = true;
        if (this.prints.instanceColor) this.prints.instanceColor.needsUpdate = true;
      }
      this.contacts[leg] = c;
    });
    if (e.lastPush && e.lastPush !== this.lastPush) {
      this.lastPush = e.lastPush;
      this.pushTime = e.time;
    }
  }

  draw(env: Env, last: DecisionState): void {
    const e = env as QuadrupedEnv;
    this.env = e;
    const T = this.T;
    if (!T || !this.renderer || !e.world || !e.handles) return;
    if (!this.currPose) this.prevPose = this.currPose = this.capture(e);
    const alpha = Math.min(1, (performance.now() - this.poseTime) / Math.max(1, this.poseInterval));
    const qa = new T.Quaternion();
    const qb = new T.Quaternion();
    const body = (k: number, mesh: THREE.Object3D, offset?: [number, number, number]) => {
      const a = this.prevPose![k];
      const b = this.currPose![k];
      mesh.position.set(a.p[0] + (b.p[0] - a.p[0]) * alpha, a.p[1] + (b.p[1] - a.p[1]) * alpha, a.p[2] + (b.p[2] - a.p[2]) * alpha);
      mesh.quaternion.slerpQuaternions(qa.set(...a.q), qb.set(...b.q), alpha);
      if (offset) mesh.position.add(new T.Vector3(...offset).applyQuaternion(mesh.quaternion));
    };
    body(0, this.trunk);
    (this.trunk.material as THREE.MeshStandardMaterial).color.set(cssVar(this.board, STATE_VAR[last]));
    for (let leg = 0; leg < 4; leg++) {
      body(1 + leg * 2, this.limbs[leg * 2]);
      body(2 + leg * 2, this.limbs[leg * 2 + 1]);
      body(2 + leg * 2, this.feet[leg], [0, -e.config.shank / 2, 0]);
      (this.feet[leg].material as THREE.MeshStandardMaterial).color.set(cssVar(this.board, e.robot.contacts[leg] ? '--ink' : '--ink-3'));
    }

    // Push arrow: from beside the trunk towards it, fading out.
    const age = e.time - this.pushTime;
    if (this.lastPush && age >= 0 && age < PUSH_SHOWN) {
      const [ix, , iz] = this.lastPush.impulse;
      const len = Math.hypot(ix, iz);
      const dir = new T.Vector3(ix / len, 0, iz / len);
      const tip = this.trunk.position.clone();
      const length = 0.15 + 0.03 * len;
      const origin = tip.clone().addScaledVector(dir, -length - 0.14);
      if (!this.arrow) {
        this.arrow = makeArrow(T, cssVar(this.board, '--s2'));
        this.scene.add(this.arrow);
      }
      aim(this.arrow, origin, dir, length);
      this.arrow.visible = true;
    } else if (this.arrow) this.arrow.visible = false;

    // Camera: three-quarter view from behind and to the side, following the trunk smoothly.
    this.camX += (this.trunk.position.x - this.camX) * 0.5;
    const target = new T.Vector3(this.camX, 0.2, this.trunk.position.z);
    this.camera.position.set(target.x - 0.7, 0.9, target.z + 1.0);
    this.camera.lookAt(target);
    const sun = (this.scene.userData as { sun: THREE.DirectionalLight }).sun;
    sun.position.set(target.x - 2, 5, 3);
    sun.target.position.copy(target);
    const bg = new T.Color(cssVar(this.board, '--board'));
    this.scene.background = bg;
    this.scene.fog = new T.Fog(bg, 3, 9);
    this.renderer.render(this.scene, this.camera);

    const speed = e.time > 0 ? e.score() / e.time : 0;
    this.hud.innerHTML = `${e.score().toFixed(2)} m · ${speed.toFixed(2)} m/s · ${e.time.toFixed(1)} s${e.end === 'fall' ? ' · <b>fell</b>' : ''}<br>friction ${e.friction.toFixed(2)} · pushes ${e.nextPush} + yours ${this.visitorPushes} · drag to push it`;
  }

  dispose(): void {
    this.disposed = true;
    this.renderer?.dispose();
    this.glCanvas.remove();
    this.hud.remove();
    this.board.style.visibility = '';
  }
}
