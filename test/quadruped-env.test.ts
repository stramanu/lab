import { beforeAll, describe, expect, it } from 'vitest';
import { CANDIDATES, initQuadrupedPhysics, QuadrupedEnv, schedulePushes, DEFAULT_QUADRUPED_CONFIG, tiltOf } from '../src/games/quadruped';

const ZERO = [0, 0, 0, 0];

function play(env: QuadrupedEnv, decisions: number, action: ArrayLike<number> = ZERO): void {
  for (let d = 0; d < decisions && !env.isDone(); d++) env.advance(action);
}

describe('quadruped environment before initialisation', () => {
  it('names the missing physics initialisation', () => {
    expect(() => new QuadrupedEnv()).toThrow(/initQuadrupedPhysics/);
  });
});

describe('quadruped environment', () => {
  beforeAll(async () => {
    await initQuadrupedPhysics();
  });

  it('is bitwise deterministic given the seed', () => {
    const run = () => {
      const env = new QuadrupedEnv({ pushImpulse: 3 });
      env.reset(10001);
      const poses: number[] = [];
      for (let d = 0; d < 40; d++) {
        env.advance(CANDIDATES[d % CANDIDATES.length]);
        poses.push(...env.robot.pos, env.robot.rot.w);
      }
      env.dispose();
      return poses;
    };
    expect(run()).toEqual(run());
  });

  it('continues identically after a snapshot is restored', () => {
    const env = new QuadrupedEnv({ pushImpulse: 3 });
    env.reset(10002);
    play(env, 25);
    const copy = env.clone();
    for (let d = 0; d < 20; d++) {
      env.advance(CANDIDATES[d % 5]);
      copy.advance(CANDIDATES[d % 5]);
    }
    expect([...copy.robot.pos, copy.robot.rot.x, copy.robot.rot.w, copy.time]).toEqual([...env.robot.pos, env.robot.rot.x, env.robot.rot.w, env.time]);
    expect(Array.from(copy.encode())).toEqual(Array.from(env.encode()));
    copy.dispose();
    env.dispose();
  });

  it('schedules the same pushes for the same seed', () => {
    const cfg = { ...DEFAULT_QUADRUPED_CONFIG, pushImpulse: 3 };
    expect(schedulePushes(7, cfg)).toEqual(schedulePushes(7, cfg));
    expect(schedulePushes(7, cfg)).not.toEqual(schedulePushes(8, cfg));
    expect(schedulePushes(7, { ...cfg, pushImpulse: 0 })).toEqual([]);
  });

  it('ends the episode on a fall, with the displacement reached so far as the score', () => {
    const env = new QuadrupedEnv({ pushImpulse: 0 });
    env.reset(10003);
    play(env, 10);
    env.pushes = [{ time: env.time, impulse: [0, 0, 25] }];
    env.nextPush = 0;
    play(env, 30);
    expect(env.end).toBe('fall');
    expect(tiltOf(env.robot.rot) > (60 * Math.PI) / 180 || env.robot.pos[1] < 0.12).toBe(true);
    expect(env.summary().score).toBe(env.robot.pos[0]);
    env.dispose();
  });

  it('encodes 46 finite values', () => {
    const env = new QuadrupedEnv();
    env.reset(10004);
    play(env, 15);
    const x = env.encode();
    expect(x.length).toBe(46);
    expect(x.every(Number.isFinite)).toBe(true);
    env.dispose();
  });

  it('plays the base controller with the zero action (candidate 0)', () => {
    const a = new QuadrupedEnv();
    const b = new QuadrupedEnv();
    a.reset(10005);
    b.reset(10005);
    for (let d = 0; d < 30; d++) {
      a.step(0);
      b.stepContinuous(ZERO);
    }
    expect(a.robot.pos).toEqual(b.robot.pos);
    a.dispose();
    b.dispose();
  });

  it('walks forward without pushes for a whole episode', () => {
    const env = new QuadrupedEnv({ pushImpulse: 0 });
    env.reset(10006);
    play(env, 1000);
    expect(env.end).toBe('timeout');
    expect(env.score() / env.time).toBeGreaterThan(0.25);
    env.dispose();
  }, 30_000);
});
