import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_QUADRUPED_CONFIG,
  DEFAULT_TERRAIN,
  generateTerrain,
  hillHeight,
  initQuadrupedPhysics,
  QuadrupedEnv,
  rapier,
  SCAN_ACROSS,
  SCAN_AHEAD,
  SCAN_SIZE,
  surfaceHeight,
  type TerrainKind,
} from '../src/games/quadruped';

const terrain = (kind: TerrainKind) => ({ ...DEFAULT_TERRAIN, kind });

/** Height of the physics ground at (x, z), by a ray cast straight down. */
function groundAt(env: QuadrupedEnv, x: number, z: number): number {
  const R = rapier();
  const hit = env.world!.castRay(new R.Ray({ x, y: 5, z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, (0xffff << 16) | 0x0001); // ground only
  return 5 - hit!.timeOfImpact;
}

describe('quadruped terrain', () => {
  beforeAll(async () => {
    await initQuadrupedPhysics();
  });

  it('is flat by default, and the same seed draws the same terrain', () => {
    expect(DEFAULT_QUADRUPED_CONFIG.terrain.kind).toBe('flat');
    expect(generateTerrain(10001, DEFAULT_TERRAIN)).toEqual({ kind: 'flat', hills: [], branches: [] });
    expect(generateTerrain(10001, terrain('mixed'))).toEqual(generateTerrain(10001, terrain('mixed')));
    expect(generateTerrain(10001, terrain('mixed'))).not.toEqual(generateTerrain(10002, terrain('mixed')));
  });

  it('draws every kind with the varied terrain, deterministically per seed', () => {
    const kinds = new Set<string>();
    for (let seed = 10001; seed <= 10040; seed++) {
      const spec = generateTerrain(seed, terrain('varied'));
      kinds.add(spec.kind);
      expect(generateTerrain(seed, terrain('varied'))).toEqual(spec);
    }
    expect([...kinds].sort()).toEqual(['branches', 'flat', 'hills', 'mixed']);
  });

  it('starts every episode on flat ground and keeps hills within the maximum slope', () => {
    for (let seed = 10001; seed <= 10010; seed++) {
      const spec = generateTerrain(seed, terrain('hills'));
      expect(spec.hills.length).toBeGreaterThan(0);
      for (let x = -2; x < DEFAULT_TERRAIN.start; x += 0.1) expect(hillHeight(spec, x, 0)).toBe(0);
      let steepest = 0;
      for (let z = -1; z <= 1; z += 0.25) {
        for (let x = 0; x < 18; x += 0.01) steepest = Math.max(steepest, Math.abs(hillHeight(spec, x + 0.01, z) - hillHeight(spec, x, z)) / 0.01);
      }
      expect((Math.atan(steepest) * 180) / Math.PI).toBeLessThanOrEqual(DEFAULT_TERRAIN.maxSlopeDeg + 0.05);
    }
  });

  // Sample points are off the grid lines: a ray exactly through a heightfield vertex can miss it.
  it('builds physics that matches the analytic surface (hills and branches)', () => {
    const env = new QuadrupedEnv({ terrain: terrain('mixed') });
    env.reset(10003);
    env.world!.step(); // builds the scene queries
    const spec = env.terrain;
    expect(spec.branches.length).toBeGreaterThan(0);
    for (const [x, z] of [[2.33, 0.47], [3.01, 0.03], [5.17, -0.71], [8.83, 0.26], [12.46, 1.32], [15.04, -1.83]]) {
      expect(Math.abs(groundAt(env, x, z) - surfaceHeight(spec, x, z))).toBeLessThan(0.01);
    }
    for (const br of spec.branches.slice(0, 5)) {
      const x = (br.a[0] + br.b[0]) / 2;
      const z = (br.a[2] + br.b[2]) / 2;
      const top = surfaceHeight(spec, x, z);
      expect(top).toBeGreaterThan(hillHeight(spec, x, z) + br.radius);
      expect(Math.abs(groundAt(env, x, z) - top)).toBeLessThan(0.003);
    }
    env.dispose();
  });

  it('is deterministic and restores from a snapshot on terrain', () => {
    const run = () => {
      const env = new QuadrupedEnv({ terrain: terrain('mixed') });
      env.reset(10004);
      for (let d = 0; d < 40 && !env.isDone(); d++) env.advance([0, 0, 0, 0]);
      const copy = env.restore(env.snapshot());
      for (let d = 0; d < 20; d++) {
        env.advance([0.5, 0, 0, 0]);
        copy.advance([0.5, 0, 0, 0]);
      }
      const out = [env.score(), copy.score(), env.encode()[0], copy.encode()[0]];
      env.dispose();
      copy.dispose();
      return out;
    };
    const a = run();
    expect(a[0]).toBe(a[1]);
    expect(a[2]).toBe(a[3]);
    expect(run()).toEqual(a);
  });
});

describe('quadruped height scan', () => {
  beforeAll(async () => {
    await initQuadrupedPhysics();
  });

  it('is off by default and leaves the 46-value encoding unchanged', () => {
    const env = new QuadrupedEnv();
    env.reset(10001);
    expect(env.encodingSize).toBe(46);
    expect(env.encode().length).toBe(46);
    const scan = new QuadrupedEnv({ heightScan: true });
    scan.reset(10001);
    expect(scan.encodingSize).toBe(46 + SCAN_SIZE);
    expect(Array.from(scan.encode().slice(0, 46))).toEqual(Array.from(env.encode()));
    env.dispose();
    scan.dispose();
  });

  it('reads zero on flat ground when standing, and sees a hill ahead', () => {
    const env = new QuadrupedEnv({ heightScan: true });
    env.reset(10001);
    const flat = env.encode().slice(46);
    for (const v of flat) expect(Math.abs(v)).toBeLessThan(0.05);
    // A 10 cm bump centred 0.6 m ahead (the physics is unchanged; the scan reads the terrain description).
    env.terrain = { kind: 'hills', hills: [{ x: 0.6, width: 0.6, height: 0.1, lateral: 0, k: 1, phase: 0 }], branches: [] };
    const scan = env.encode().slice(46);
    const at = (a: number, c: number) => scan[SCAN_AHEAD.findIndex((x) => Math.abs(x - a) < 1e-9) * SCAN_ACROSS.length + SCAN_ACROSS.findIndex((x) => Math.abs(x - c) < 1e-9)];
    expect(at(0.6, 0)).toBeCloseTo(-1, 1); // ground 10 cm higher: one unit closer to the trunk
    expect(Math.abs(at(-0.2, 0))).toBeLessThan(0.05);
    expect(Math.abs(at(0, 0.3))).toBeLessThan(0.05);
    env.dispose();
  });

  it('is identical after a snapshot is restored, on terrain', () => {
    const env = new QuadrupedEnv({ heightScan: true, terrain: terrain('mixed') });
    env.reset(10003);
    for (let d = 0; d < 30 && !env.isDone(); d++) env.advance([0, 0, 0, 0]);
    const copy = env.restore(env.snapshot());
    expect(Array.from(copy.encode())).toEqual(Array.from(env.encode()));
    env.dispose();
    copy.dispose();
  });
});
