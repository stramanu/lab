import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { argmax } from '../src/core/types';
import {
  BRAKE,
  DEFAULT_RACING_CONFIG,
  GAS,
  RACING_ENCODING_SIZE,
  RacingEnv,
  RacingGuard,
  RacingTeacher,
  STEER_HOLD,
  STEER_LEFT,
  action,
  controllerAction,
  emptyCar,
  generateTrack,
  lateralOffset,
  pedalOf,
  simulateDecision,
} from '../src/games/racing';

const cfg = DEFAULT_RACING_CONFIG;

/** Segments (a,b) and (c,d) properly intersect. */
function intersects(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

describe('racing track', () => {
  it('is determined by the seed', () => {
    const a = generateTrack(1, cfg);
    const b = generateTrack(1, cfg);
    const c = generateTrack(2, cfg);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(a.length).not.toBe(c.length);
  });

  it('never self-intersects and stays drivable over 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = generateTrack(seed + 30_000, cfg);
      // Sub-sample to keep the O(n²) check fast; neighbouring segments are skipped.
      const step = 8;
      const idx = Array.from({ length: Math.floor(t.n / step) }, (_, i) => i * step);
      for (let p = 0; p < idx.length; p++) {
        for (let q = p + 2; q < idx.length - (p === 0 ? 1 : 0); q++) {
          const [i, j] = [idx[p], idx[q]];
          const i2 = idx[(p + 1) % idx.length];
          const j2 = idx[(q + 1) % idx.length];
          expect(intersects(t.x[i], t.y[i], t.x[i2], t.y[i2], t.x[j], t.y[j], t.x[j2], t.y[j2])).toBe(false);
        }
      }
      expect(Math.max(...Array.from(t.kappa, Math.abs))).toBeLessThan(1 / 12);
    }
  });
});

describe('racing physics', () => {
  const straight = () => {
    const t = generateTrack(3, cfg);
    return RacingEnv.fromState(t, { x: t.x[0], y: t.y[0], heading: Math.atan2(t.ty[0], t.tx[0]), speed: 0, index: 0 });
  };

  it('accelerates in a straight line without turning', () => {
    const e = straight();
    const h0 = e.car.heading;
    e.step(action(STEER_HOLD, GAS));
    expect(e.car.speed).toBeGreaterThan(0);
    expect(e.car.heading).toBe(h0);
  });

  it('caps lateral acceleration at mu * g and slides wide', () => {
    const car = { ...emptyCar(), speed: 30, steer: 0.3, steerTarget: 0.3 };
    const t = generateTrack(3, cfg);
    Object.assign(car, { x: t.x[0], y: t.y[0], heading: Math.atan2(t.ty[0], t.tx[0]), index: 0 });
    const h0 = car.heading;
    simulateDecision(car, t, { ...cfg, stepsPerDecision: 1 }, action(STEER_HOLD, GAS));
    const commandedYaw = (30 * Math.tan(0.3)) / cfg.wheelbase;
    const realisedYaw = (car.heading - h0) / cfg.dt;
    expect(car.sliding).toBe(true);
    expect(realisedYaw).toBeLessThan(commandedYaw);
    expect(Math.abs(realisedYaw * 30)).toBeLessThanOrEqual(cfg.mu * cfg.gravity + 1e-6);
  });

  it('ends off-track when the lateral offset exceeds half the width', () => {
    const t = generateTrack(4, cfg);
    const e = RacingEnv.fromState(t, { x: t.x[0] - t.ty[0] * 4.9, y: t.y[0] + t.tx[0] * 4.9, heading: Math.atan2(t.ty[0], t.tx[0]) + 0.6, speed: 20, index: 0 });
    for (let i = 0; i < 10 && !e.isDone(); i++) e.step(action(STEER_LEFT, GAS));
    expect(e.summary().endReason).toBe('off-track');
    expect(Math.abs(lateralOffset(t, e.car.index, e.car.x, e.car.y))).toBeGreaterThan(t.width / 2);
  });

  it('is deterministic and every action is legal', () => {
    const play = () => {
      const e = new RacingEnv();
      e.reset(7);
      const rng = Rng.stream(1, 'r');
      const trace: string[] = [];
      for (let i = 0; i < 200 && !e.isDone(); i++) {
        e.step(rng.int(6));
        trace.push(JSON.stringify(e.car));
      }
      return trace;
    };
    expect(play()).toEqual(play());
    const e = new RacingEnv();
    e.reset(1);
    expect(e.legalActions()).toEqual(new Array(6).fill(true));
  });

  it('encodes 20 finite values along an episode', () => {
    const e = new RacingEnv();
    e.reset(8);
    expect(RACING_ENCODING_SIZE).toBe(20);
    while (!e.isDone()) {
      const v = e.encode();
      expect(v.length).toBe(20);
      expect(v.every(Number.isFinite)).toBe(true);
      e.step(controllerAction(e.car, e.track, e.config));
    }
  });
});

describe('racing teacher and guard', () => {
  /** Fast, near a sharp corner: a state where every gas action leaves the track and some braking action does not. */
  function cornerState(): RacingEnv {
    for (let seed = 1; seed < 60; seed++) {
      const t = generateTrack(seed + 40_000, cfg);
      let i = 0;
      for (let k = 0; k < t.n; k++) if (Math.abs(t.kappa[k]) > Math.abs(t.kappa[i])) i = k;
      for (const speed of [26, 30, 34, 38]) {
        for (let back = 15; back <= 70; back += 5) {
          const start = (i - back + t.n) % t.n;
          const e = RacingEnv.fromState(t, { x: t.x[start], y: t.y[start], heading: Math.atan2(t.ty[start], t.tx[start]), speed, index: start });
          const survives = (first: number) => {
            const c = e.clone();
            c.step(first);
            for (let d = 0; d < 40 && !c.isDone(); d++) c.step(controllerAction(c.car, c.track, c.config));
            return !c.isDone() || c.car.end === 'timeout';
          };
          const anyBrake = [0, 1, 2].some((st) => survives(action(st, BRAKE)));
          const anyGas = [0, 1, 2].some((st) => survives(action(st, GAS)));
          if (anyBrake && !anyGas) return e;
        }
      }
    }
    throw new Error('no corner state found');
  }

  it('brakes when only braking keeps the car on track', () => {
    const e = cornerState();
    const { scores } = new RacingTeacher().score(e);
    expect(pedalOf(argmax(scores))).toBe(BRAKE);
  });

  it('is deterministic and cost grows with depth', () => {
    const e = new RacingEnv();
    e.reset(9);
    const t = new RacingTeacher();
    const a = t.score(e);
    const b = t.score(e.clone());
    expect(Array.from(a.scores)).toEqual(Array.from(b.scores));
    expect(a.cost).toBe(b.cost);
    const shallow = new RacingTeacher({ depth: 1, horizon: 10, margins: [0.85] }).score(e).cost;
    expect(new RacingTeacher({ depth: 2, horizon: 10, margins: [0.85] }).score(e).cost).toBeGreaterThan(shallow);
  });

  it('guard rejects steering outward at the edge and accepts a safe straight', () => {
    const t = generateTrack(5, cfg);
    const i = 0;
    const left = { x: -t.ty[i], y: t.tx[i] };
    const edge = RacingEnv.fromState(t, { x: t.x[i] + left.x * 4.5, y: t.y[i] + left.y * 4.5, heading: Math.atan2(t.ty[i], t.tx[i]) + 0.4, speed: 25, steer: 0.3, steerTarget: 0.3, index: i });
    const guard = new RacingGuard();
    expect(guard.check(edge, action(STEER_LEFT, GAS)).ok).toBe(false);
    const slow = RacingEnv.fromState(t, { x: t.x[i], y: t.y[i], heading: Math.atan2(t.ty[i], t.tx[i]), speed: 3, index: i });
    expect(guard.check(slow, action(STEER_HOLD, GAS)).ok).toBe(true);
  });

  it('guard costs at most a tenth of the teacher', () => {
    const e = new RacingEnv();
    e.reset(11);
    const teacher = new RacingTeacher();
    const guard = new RacingGuard();
    let g = 0;
    let tc = 0;
    let n = 0;
    for (let d = 0; d < 100 && !e.isDone(); d++) {
      const r = teacher.score(e);
      const a = argmax(r.scores);
      g += guard.check(e, a).cost;
      tc += r.cost;
      n++;
      e.step(a);
    }
    expect(g / n).toBeLessThanOrEqual(tc / n / 10);
  });
});
