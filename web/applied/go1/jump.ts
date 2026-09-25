/**
 * A jump with the Go1's own legs, hand-written (not learned), on the move: the motors follow a fixed
 * sequence (crouch, push, legs back under the body in the air), then the walking policy takes over again to
 * land and walk on.
 *
 * Thigh and calf have the same length, so a leg with knee = −2·hip keeps the foot straight under the hip:
 * crouching and extending along that line pushes the trunk vertically. A forward lean (added to the hips)
 * cancels the backward rotation of a vertical push. The robot's own forward speed already carries it
 * forward, so the lean shrinks with the commanded speed: lean = 0.6 − 0.4·vx (rad, vx in m/s).
 *
 * Tuned in simulation on the page's scenes (24 episodes per setting, jumping while walking):
 * - flat, at 0, 0.5 and 1 m/s: 23/24 landings each, 29–33 cm of trunk rise;
 * - flat, turning or sideways: 21–22/24; backward at 0.6 m/s: 18/24;
 * - rough ground: 21/24 standing, 17/24 at 0.5 m/s, 12/24 at 1 m/s.
 * A fixed sequence cannot correct its own rotation in the air (pitch reaches 50–90°), which is why agile
 * jumps are learned (reinforcement learning).
 */
import type { Go1Constants } from '../go1-controller';

/** A leg pose on the vertical line: hip = h (+ the lean when `leans`), knee = −2h (radians). */
type Pose = { h: number; leans: boolean };

/** Forward lean at rest, and how much of it each m/s of commanded forward speed takes away. */
const LEAN = 0.6;
const LEAN_PER_MS = 0.4;

/** Phases in control steps (20 ms each). */
const PHASES: Array<{ name: string; steps: number; pose: Pose }> = [
  { name: 'crouch', steps: 10, pose: { h: 1.3, leans: true } },
  { name: 'push', steps: 4, pose: { h: 0.7, leans: true } },
  { name: 'air', steps: 10, pose: { h: 0.9, leans: false } },
];

export class Go1Jump {
  private phase = -1;
  private step = 0;
  private lean = LEAN;

  constructor(private readonly c: Go1Constants) {}

  get active(): boolean {
    return this.phase >= 0;
  }

  get phaseName(): string {
    return this.active ? PHASES[this.phase].name : '';
  }

  /** Starts a jump; `vx` is the commanded forward speed (m/s). */
  start(vx: number): void {
    if (!this.active) {
      this.lean = LEAN - LEAN_PER_MS * vx;
      this.phase = 0;
      this.step = 0;
    }
  }

  cancel(): void {
    this.phase = -1;
  }

  /** The action for this control step: a fixed joint pose, as a policy-scale action. */
  next(): Float64Array {
    const { pose } = PHASES[this.phase];
    const action = new Float64Array(12);
    for (let i = 0; i < 12; i++) {
      const target = [this.c.default_pose[i], pose.h + (pose.leans ? this.lean : 0), -2 * pose.h][i % 3];
      action[i] = (target - this.c.default_pose[i]) / this.c.action_scale;
    }
    if (++this.step >= PHASES[this.phase].steps) {
      this.step = 0;
      this.phase = this.phase + 1 < PHASES.length ? this.phase + 1 : -1;
    }
    return action;
  }
}
