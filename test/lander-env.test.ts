import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  DEFAULT_LANDER_CONFIG,
  LANDER_ENCODING_SIZE,
  LEFT,
  LanderEnv,
  MAIN,
  NONE,
  RIGHT,
  generateWorld,
  terrainHeight,
  type World,
} from '../src/games/lander';

const cfg = DEFAULT_LANDER_CONFIG;
const decision = cfg.dt * cfg.stepsPerDecision;

/** Flat world at y=5 with the pad at x in [44, 56] and no wind. */
function flatWorld(): World {
  return { heights: new Float64Array(21).fill(5), spacing: 5, padX0: 44, padX1: 56, padY: 5, wind0: 0, windPhase: 0 };
}

const env = (state: Parameters<typeof LanderEnv.fromState>[1]) => LanderEnv.fromState(flatWorld(), state, { windScale: 0 });

describe('lander physics', () => {
  it('free falls under gravity', () => {
    const e = env({ x: 50, y: 40 });
    e.step(NONE);
    expect(e.state.vy).toBeCloseTo(-cfg.gravity * decision, 9);
    expect(e.state.vx).toBe(0);
  });

  it('main engine accelerates along the up axis against gravity and burns fuel', () => {
    const e = env({ x: 50, y: 40 });
    e.step(MAIN);
    expect(e.state.vy).toBeCloseTo((cfg.mainThrust - cfg.gravity) * decision, 9);
    expect(e.state.fuel).toBeCloseTo(cfg.fuel - cfg.mainBurn * decision, 9);
  });

  it('side thrusters spin the ship in opposite directions', () => {
    const l = env({ x: 50, y: 40 });
    const r = env({ x: 50, y: 40 });
    l.step(LEFT);
    r.step(RIGHT);
    expect(l.state.omega).toBeCloseTo(cfg.sideAngularAccel * decision, 9);
    expect(r.state.omega).toBeCloseTo(-cfg.sideAngularAccel * decision, 9);
    expect(l.state.fuel).toBeLessThan(cfg.fuel);
  });

  it('with an empty tank every action behaves as none', () => {
    const a = env({ x: 50, y: 40, fuel: 0 });
    const b = env({ x: 50, y: 40, fuel: 0 });
    a.step(MAIN);
    b.step(NONE);
    expect(a.state).toEqual(b.state);
  });

  it('all four actions are legal', () => {
    expect(env({ x: 50, y: 40 }).legalActions()).toEqual([true, true, true, true]);
  });
});

describe('lander episode end', () => {
  it('lands softly on the pad', () => {
    const e = env({ x: 50, y: 5.05, vy: -1, vx: 0.2 });
    const r = e.step(NONE);
    expect(r.done).toBe(true);
    expect(e.summary().endReason).toBe('landed');
    expect(e.score()).toBeGreaterThan(100);
  });

  it('crashes when touching the pad too fast', () => {
    const e = env({ x: 50, y: 5.1, vy: -5 });
    e.step(NONE);
    expect(e.summary().endReason).toBe('crashed');
    expect(e.score()).toBe(0);
    expect(e.summary().metrics.impactSpeed).toBeGreaterThan(5);
  });

  it('crashes when touching terrain off the pad', () => {
    const e = env({ x: 20, y: 5.05, vy: -1 });
    e.step(NONE);
    expect(e.summary().endReason).toBe('crashed');
  });

  it('crashes when tilted', () => {
    const e = env({ x: 50, y: 5.05, vy: -1, angle: 0.5 });
    e.step(NONE);
    expect(e.summary().endReason).toBe('crashed');
  });

  it('ends out of bounds past the side', () => {
    const e = env({ x: 99.9, y: 40, vx: 5 });
    e.step(NONE);
    expect(e.summary().endReason).toBe('out');
  });

  it('times out after the decision limit', () => {
    const e = LanderEnv.fromState(flatWorld(), { x: 50, y: 40 }, { windScale: 0, maxDecisions: 3, gravity: 0 });
    e.step(NONE);
    e.step(NONE);
    expect(e.isDone()).toBe(false);
    e.step(NONE);
    expect(e.summary().endReason).toBe('timeout');
  });

  it('reports the summary metrics', () => {
    const e = env({ x: 50, y: 5.05, vy: -1 });
    e.step(MAIN);
    const m = e.summary().metrics;
    expect(Object.keys(m).sort()).toEqual(['flightTime', 'fuelUsed', 'impactSpeed', 'landed']);
    expect(m.flightTime).toBeGreaterThan(0);
  });
});

describe('lander determinism and seeded worlds', () => {
  const play = (seed: number) => {
    const e = new LanderEnv();
    e.reset(seed);
    const rng = Rng.stream(3, 'acts');
    const trace: string[] = [];
    while (!e.isDone()) {
      e.step(rng.int(4));
      trace.push(JSON.stringify(e.state));
    }
    return trace;
  };

  it('same seed and actions give the same states', () => {
    expect(play(7)).toEqual(play(7));
  });

  it('the seed determines terrain, pad, wind and start', () => {
    const a = new LanderEnv();
    const b = new LanderEnv();
    const c = new LanderEnv();
    a.reset(1);
    b.reset(1);
    c.reset(2);
    expect(a.world).toEqual(b.world);
    expect(a.state).toEqual(b.state);
    expect(a.world.padX0).not.toBe(c.world.padX0);
  });

  it('the pad is flat and inside the world', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const w = generateWorld(seed, cfg);
      expect(w.padX0).toBeGreaterThanOrEqual(0);
      expect(w.padX1).toBeLessThanOrEqual(cfg.width);
      for (let x = w.padX0; x <= w.padX1; x += 0.5) expect(terrainHeight(w, x)).toBe(w.padY);
    }
  });

  it('clone evolves identically', () => {
    const e = new LanderEnv();
    e.reset(9);
    const c = e.clone();
    for (let i = 0; i < 20; i++) {
      e.step(i % 4);
      c.step(i % 4);
    }
    expect(c.state).toEqual(e.state);
  });
});

describe('lander encoding', () => {
  it('has 16 finite values and flags the pad', () => {
    expect(LANDER_ENCODING_SIZE).toBe(16);
    const over = env({ x: 50, y: 30 }).encode();
    const off = env({ x: 20, y: 30 }).encode();
    expect(over.length).toBe(16);
    expect(over.every(Number.isFinite)).toBe(true);
    expect(over[14]).toBe(1);
    expect(off[14]).toBe(0);
  });

  it('stays finite along random episodes', () => {
    const e = new LanderEnv();
    e.reset(11);
    const rng = Rng.stream(1, 'x');
    while (!e.isDone()) {
      expect(e.encode().every(Number.isFinite)).toBe(true);
      e.step(rng.int(4));
    }
    expect(e.render()).toContain('end=');
  });
});
