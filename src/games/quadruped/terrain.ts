/**
 * Procedural terrain for the quadruped, drawn from the episode seed: smooth hills across the path (a
 * heightfield) and branches lying on the ground (fixed cylinders). The robot perceives none of it
 * directly; it only feels it through its joints, contacts and attitude. Flat terrain adds no collider, so
 * flat episodes are identical to those of the trained network and of the published study.
 */
import type { World } from '@dimforge/rapier3d-deterministic-compat';
import { Rng } from '../../core/rng';
import { rapier } from './rapier';

export type TerrainKind = 'flat' | 'hills' | 'branches' | 'mixed';
export const TERRAIN_KINDS: readonly TerrainKind[] = ['flat', 'hills', 'branches', 'mixed'];

export interface TerrainConfig {
  kind: TerrainKind;
  /** Steepest slope of a hill (degrees); each hill draws its own in [0.5, 1] × this. */
  maxSlopeDeg: number;
  /** Hill length along the path (m). */
  hillWidth: [number, number];
  /** Branches per metre of path. */
  branchDensity: number;
  branchRadius: [number, number];
  branchLength: [number, number];
  /** The terrain starts this far ahead of the start (m), so every episode begins on flat ground. */
  start: number;
  /** Extent of the heightfield along x (from −2 m) and across z (±halfWidth). */
  length: number;
  halfWidth: number;
  /** Heightfield cell size (m). */
  cell: number;
}

/** Slope and branch density calibrated in the terrain spike (EXPERIMENTS.md, decision 37). */
export const DEFAULT_TERRAIN: TerrainConfig = {
  kind: 'flat',
  maxSlopeDeg: 16,
  hillWidth: [2, 4],
  branchDensity: 1,
  branchRadius: [0.012, 0.025],
  branchLength: [0.5, 1.2],
  start: 1.5,
  length: 22,
  halfWidth: 4,
  cell: 0.1,
};

/** A hill across the path: height·(1 + cos)/2 over [x − width/2, x + width/2], gently modulated across z. */
export interface Hill {
  x: number;
  width: number;
  height: number;
  /** Lateral modulation: height × (1 + lateral·sin(k·z + phase)). */
  lateral: number;
  k: number;
  phase: number;
}

/** A straight branch lying on the ground between two points (its axis endpoints). */
export interface Branch {
  a: [number, number, number];
  b: [number, number, number];
  radius: number;
}

/** Everything that defines one episode's terrain: plain data, so it travels with snapshots to workers. */
export interface TerrainSpec {
  kind: TerrainKind;
  hills: Hill[];
  branches: Branch[];
}

export const FLAT_TERRAIN: TerrainSpec = { kind: 'flat', hills: [], branches: [] };

export function generateTerrain(seed: number, cfg: TerrainConfig): TerrainSpec {
  if (cfg.kind === 'flat') return FLAT_TERRAIN;
  const rng = Rng.stream(seed, 'quadruped-terrain');
  const uniform = ([a, b]: [number, number]) => a + (b - a) * rng.next();
  const end = cfg.length - 2 - 1; // stay one metre inside the heightfield's far edge
  const hills: Hill[] = [];
  if (cfg.kind === 'hills' || cfg.kind === 'mixed') {
    for (let x = cfg.start; ; ) {
      const width = uniform(cfg.hillWidth);
      if (x + width > end) break;
      const slope = ((0.5 + 0.5 * rng.next()) * cfg.maxSlopeDeg * Math.PI) / 180;
      const lateral = 0.2 * rng.next();
      // The steepest point of height·(1 + cos(2πu/width))/2 has slope π·height/width; dividing by the lateral
      // modulation's peak keeps the steepest point along the path within `slope`.
      const height = (Math.tan(slope) * width) / Math.PI / (1 + lateral);
      hills.push({ x: x + width / 2, width, height, lateral, k: 0.5 + rng.next(), phase: 2 * Math.PI * rng.next() });
      x += width + 1.5 * rng.next();
    }
  }
  const spec: TerrainSpec = { kind: cfg.kind, hills, branches: [] };
  if (cfg.kind === 'branches' || cfg.kind === 'mixed') {
    const count = Math.round(cfg.branchDensity * (end - cfg.start));
    for (let i = 0; i < count; i++) {
      const cx = cfg.start + 0.3 + (end - cfg.start - 0.3) * rng.next();
      const cz = -0.5 + rng.next();
      const angle = Math.PI / 2 + (rng.next() * 2 - 1) * 0.6; // roughly across the path
      const half = uniform(cfg.branchLength) / 2;
      const radius = uniform(cfg.branchRadius);
      const dx = Math.cos(angle) * half;
      const dz = Math.sin(angle) * half;
      const end0: [number, number] = [cx - dx, cz - dz];
      const end1: [number, number] = [cx + dx, cz + dz];
      spec.branches.push({
        a: [end0[0], hillHeight(spec, end0[0], end0[1]) + radius, end0[1]],
        b: [end1[0], hillHeight(spec, end1[0], end1[1]) + radius, end1[1]],
        radius,
      });
    }
  }
  return spec;
}

/** Height of the hills alone at (x, z): what the trunk's height and the fall check are measured from. */
export function hillHeight(spec: TerrainSpec, x: number, z: number): number {
  let h = 0;
  for (const hill of spec.hills) {
    const u = x - hill.x;
    if (Math.abs(u) >= hill.width / 2) continue;
    h += hill.height * 0.5 * (1 + Math.cos((2 * Math.PI * u) / hill.width)) * (1 + hill.lateral * Math.sin(hill.k * z + hill.phase));
  }
  return h;
}

/** Height of the ground surface at (x, z), branches included: what foot contacts are measured from. */
export function surfaceHeight(spec: TerrainSpec, x: number, z: number): number {
  let h = hillHeight(spec, x, z);
  for (const br of spec.branches) {
    const ax = br.b[0] - br.a[0];
    const az = br.b[2] - br.a[2];
    const len2 = ax * ax + az * az;
    const t = ((x - br.a[0]) * ax + (z - br.a[2]) * az) / len2;
    if (t < 0 || t > 1) continue;
    const px = br.a[0] + t * ax - x;
    const pz = br.a[2] + t * az - z;
    const s2 = px * px + pz * pz;
    if (s2 >= br.radius * br.radius) continue;
    h = Math.max(h, br.a[1] + t * (br.b[1] - br.a[1]) + Math.sqrt(br.radius * br.radius - s2));
  }
  return h;
}

/** Adds the terrain's colliders to a world (nothing for flat terrain). */
export function addTerrain(world: World, spec: TerrainSpec, cfg: TerrainConfig, friction: number, groups: number): void {
  if (!spec.hills.length && !spec.branches.length) return;
  const R = rapier();
  if (spec.hills.length) {
    const ncols = Math.round(cfg.length / cfg.cell); // along x
    const nrows = Math.round((2 * cfg.halfWidth) / cfg.cell); // along z
    const heights = new Float32Array((nrows + 1) * (ncols + 1));
    const x0 = -2;
    for (let j = 0; j <= ncols; j++) {
      for (let i = 0; i <= nrows; i++) heights[i + j * (nrows + 1)] = hillHeight(spec, x0 + j * cfg.cell, -cfg.halfWidth + i * cfg.cell);
    }
    world.createCollider(
      R.ColliderDesc.heightfield(nrows, ncols, heights, { x: cfg.length, y: 1, z: 2 * cfg.halfWidth })
        .setTranslation(x0 + cfg.length / 2, 0, 0)
        .setFriction(friction)
        .setCollisionGroups(groups),
    );
  }
  for (const br of spec.branches) {
    const d = [br.b[0] - br.a[0], br.b[1] - br.a[1], br.b[2] - br.a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    const u = [d[0] / len, d[1] / len, d[2] / len];
    // Rotation taking the cylinder's axis (+y) onto u: axis y × u, angle acos(u_y).
    const axis = [u[2], 0, -u[0]];
    const sin = Math.hypot(axis[0], axis[2]);
    const angle = Math.atan2(sin, u[1]);
    const s = Math.sin(angle / 2) / (sin || 1);
    world.createCollider(
      R.ColliderDesc.cylinder(len / 2, br.radius)
        .setTranslation((br.a[0] + br.b[0]) / 2, (br.a[1] + br.b[1]) / 2, (br.a[2] + br.b[2]) / 2)
        .setRotation({ x: axis[0] * s, y: 0, z: axis[2] * s, w: Math.cos(angle / 2) })
        .setFriction(friction)
        .setCollisionGroups(groups),
    );
  }
}
