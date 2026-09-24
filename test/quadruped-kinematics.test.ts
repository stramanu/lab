import { describe, expect, it } from 'vitest';
import { legForward, legInverse, quatAxisAngle, quatMul, relativeAngle, rotate, tiltOf, yawOf } from '../src/games/quadruped/kinematics';

describe('quadruped leg kinematics', () => {
  it('inverse kinematics reproduces reachable foot positions', () => {
    for (const p of [
      [0, -0.28, 0],
      [0.08, -0.25, 0.03],
      [-0.1, -0.22, -0.05],
      [0.05, -0.3, 0.0],
    ] as Array<[number, number, number]>) {
      const q = legInverse(p, 0.18, 0.18);
      const f = legForward(q, 0.18, 0.18);
      f.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
      expect(q[2]).toBeLessThan(0); // knee bends backwards
    }
  });

  it('positive flexion swings the foot forward, positive abduction moves it towards −z (left)', () => {
    expect(legForward([0, 0.3, 0], 0.18, 0.18)[0]).toBeGreaterThan(0);
    expect(legForward([0.2, 0, 0], 0.18, 0.18)[2]).toBeLessThan(0);
  });

  it('measures relative angles, yaw and tilt', () => {
    const parent = quatAxisAngle([0, 1, 0], 0.4);
    const child = quatMul(parent, quatAxisAngle([0, 0, 1], -0.7));
    expect(relativeAngle(parent, child, [0, 0, 1])).toBeCloseTo(-0.7, 12);
    expect(yawOf(quatAxisAngle([0, 1, 0], 0.3))).toBeCloseTo(0.3, 12);
    expect(tiltOf(quatAxisAngle([1, 0, 0], 0.5))).toBeCloseTo(0.5, 12);
    const v = rotate(quatAxisAngle([0, 0, 1], Math.PI / 2), [1, 0, 0]);
    expect(v[1]).toBeCloseTo(1, 12);
  });
});
