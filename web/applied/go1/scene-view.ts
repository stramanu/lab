/**
 * three.js view of a MuJoCo scene, built from the compiled model: meshes, primitive geoms, the ground
 * plane and heightfields. Every frame, each drawn geom takes its pose from the simulation (geom_xpos,
 * geom_xmat). MuJoCo is z-up, three.js y-up: the whole scene sits in a group turned by −90° about x.
 */
import type { MjData, MjModel } from '@mujoco/mujoco';
import type * as THREE from 'three';

type Three = typeof THREE;

const GEOM = { plane: 0, hfield: 1, sphere: 2, capsule: 3, ellipsoid: 4, cylinder: 5, box: 6, mesh: 7 } as const;
/** Geom groups drawn: 0–2 (visual). Group 3 holds the collision proxies. */
const MAX_GROUP = 2;

export class SceneView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly world: THREE.Group;
  private readonly drawn: Array<{ id: number; object: THREE.Object3D }> = [];
  private target: THREE.Vector3;

  constructor(
    private readonly T: Three,
    readonly canvas: HTMLCanvasElement,
    private readonly model: MjModel,
    private readonly colors: { ground: string; grid: string; robot: string; background: string },
  ) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 16 / 9, 0.02, 60);
    this.target = new T.Vector3();
    this.world = new T.Group();
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    const sun = new T.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-2, 6, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    this.scene.add(sun, sun.target, new T.HemisphereLight(0xffffff, 0x8a8070, 1.2));
    (this.scene.userData as { sun: THREE.DirectionalLight }).sun = sun;
    this.build();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** A 1 m ground tile with a 0.25 m sub-grid, repeated across the ground (motion needs a reference). */
  private gridTexture(): THREE.CanvasTexture {
    const { T } = this;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = this.colors.ground;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = this.colors.grid;
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 256);
      g.moveTo(0, i * 64);
      g.lineTo(256, i * 64);
      g.stroke();
    }
    g.lineWidth = 4;
    g.strokeRect(0, 0, 256, 256);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  private build(): void {
    const { T, model } = this;
    const type = model.geom_type as Int32Array;
    const group = model.geom_group as Int32Array;
    const size = model.geom_size as Float64Array;
    const rgba = model.geom_rgba as Float32Array;
    const dataid = model.geom_dataid as Int32Array;
    for (let g = 0; g < (model.ngeom as number); g++) {
      if (group[g] > MAX_GROUP) continue;
      const s = [size[3 * g], size[3 * g + 1], size[3 * g + 2]];
      const color = new T.Color(rgba[4 * g], rgba[4 * g + 1], rgba[4 * g + 2]);
      const material = new T.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
      let geometry: THREE.BufferGeometry | null = null;
      switch (type[g]) {
        case GEOM.plane: {
          material.color.set(0xffffff);
          material.roughness = 1;
          material.map = this.gridTexture();
          material.map.repeat.set(40, 40);
          geometry = new T.PlaneGeometry(40, 40);
          break;
        }
        case GEOM.hfield:
          material.color.set(0xffffff);
          material.roughness = 1;
          material.map = this.gridTexture();
          geometry = this.heightfield(dataid[g]);
          break;
        case GEOM.sphere:
          geometry = new T.SphereGeometry(s[0], 20, 14);
          break;
        case GEOM.capsule:
          geometry = new T.CapsuleGeometry(s[0], 2 * s[1], 6, 14).rotateX(Math.PI / 2);
          break;
        case GEOM.cylinder:
          geometry = new T.CylinderGeometry(s[0], s[0], 2 * s[1], 20).rotateX(Math.PI / 2);
          break;
        case GEOM.box:
          geometry = new T.BoxGeometry(2 * s[0], 2 * s[1], 2 * s[2]);
          break;
        case GEOM.ellipsoid:
          geometry = new T.SphereGeometry(1, 20, 14).scale(s[0], s[1], s[2]);
          break;
        case GEOM.mesh:
          geometry = this.mesh(dataid[g]);
          material.color.set(this.colors.robot).lerp(color, 0.35);
          break;
      }
      if (!geometry) continue;
      const object = new T.Mesh(geometry, material);
      object.matrixAutoUpdate = false;
      object.castShadow = type[g] !== GEOM.plane && type[g] !== GEOM.hfield;
      object.receiveShadow = true;
      this.world.add(object);
      this.drawn.push({ id: g, object });
    }
  }

  /** A compiled mesh (vertices and faces in the geom's frame). */
  private mesh(id: number): THREE.BufferGeometry {
    const { T, model } = this;
    const vert = model.mesh_vert as Float32Array;
    const face = model.mesh_face as Int32Array;
    const va = (model.mesh_vertadr as Int32Array)[id];
    const vn = (model.mesh_vertnum as Int32Array)[id];
    const fa = (model.mesh_faceadr as Int32Array)[id];
    const fn = (model.mesh_facenum as Int32Array)[id];
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vert.slice(3 * va, 3 * (va + vn)), 3));
    geometry.setIndex(Array.from(face.slice(3 * fa, 3 * (fa + fn))));
    geometry.computeVertexNormals();
    return geometry;
  }

  /** A heightfield: a grid of nrow × ncol elevations over [−rx, rx] × [−ry, ry], scaled by size[2]. */
  private heightfield(id: number): THREE.BufferGeometry {
    const { T, model } = this;
    const nrow = (model.hfield_nrow as Int32Array)[id];
    const ncol = (model.hfield_ncol as Int32Array)[id];
    const adr = (model.hfield_adr as Int32Array)[id];
    const [rx, ry, top] = Array.from((model.hfield_size as Float64Array).slice(4 * id, 4 * id + 3));
    const data = model.hfield_data as Float32Array;
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    for (let r = 0; r < nrow; r++) {
      for (let c = 0; c < ncol; c++) {
        const x = -rx + (2 * rx * c) / (ncol - 1);
        const y = -ry + (2 * ry * r) / (nrow - 1);
        pos.push(x, y, data[adr + r * ncol + c] * top);
        uv.push(x, y); // one texture tile per metre
      }
    }
    for (let r = 0; r < nrow - 1; r++) {
      for (let c = 0; c < ncol - 1; c++) {
        const a = r * ncol + c;
        index.push(a, a + 1, a + ncol, a + 1, a + ncol + 1, a + ncol);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Poses every drawn geom from the simulation, follows `focus` (a world point, z-up) and renders. */
  draw(data: MjData, focus: [number, number, number]): void {
    const { T } = this;
    const xpos = data.geom_xpos as Float64Array;
    const xmat = data.geom_xmat as Float64Array;
    const matrix = new T.Matrix4();
    for (const { id, object } of this.drawn) {
      const r = xmat.subarray(9 * id, 9 * id + 9);
      matrix.set(r[0], r[1], r[2], xpos[3 * id], r[3], r[4], r[5], xpos[3 * id + 1], r[6], r[7], r[8], xpos[3 * id + 2], 0, 0, 0, 1);
      object.matrix.copy(matrix);
    }
    // Camera: behind and to the side of the robot, following smoothly (three.js coordinates).
    const f = new T.Vector3(focus[0], focus[2], -focus[1]);
    this.target.lerp(f, 0.15);
    this.camera.position.set(this.target.x - 1.1, this.target.y + 0.7, this.target.z + 1.1);
    this.camera.lookAt(this.target);
    const sun = (this.scene.userData as { sun: THREE.DirectionalLight }).sun;
    sun.position.set(this.target.x - 2, this.target.y + 6, this.target.z + 3);
    sun.target.position.copy(this.target);
    const bg = new T.Color(this.colors.background);
    this.scene.background = bg;
    this.scene.fog = new T.Fog(bg, 4, 14);
    this.renderer.render(this.scene, this.camera);
  }

  /** Where a pointer event meets the horizontal plane at height `z` (world coordinates, z-up), if it does. */
  pointOnPlane(e: PointerEvent, z: number): [number, number] | null {
    const { T } = this;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new T.Vector3();
    if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -z), hit)) return null;
    return [hit.x, -hit.z];
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
