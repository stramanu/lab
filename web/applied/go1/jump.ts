/**
 * A jump with the Go1's own legs, hand-written (not learned): the walking policy brakes, then the motors
 * follow a fixed sequence (crouch, push, legs back under the body in the air), then the policy takes over
 * again to land and walk on.
 *
 * Thigh and calf have the same length, so a leg with knee = −2·hip keeps the foot straight under the hip:
 * crouching and extending along that line pushes the trunk vertically. A forward lean (added to the hips)
 * cancels the backward drift that a vertical push gets from the trunk's centre of mass.
 *
 * Tuned in simulation on the page's scenes (12 episodes per setting, 300 ms brake first):
 * - flat, standing: ~34 cm of trunk rise, 12/12 landings, ~9 cm forward;
 * - flat, walking at 0.5 and 0.8 m/s: 11/12 and 12/12 landings, ~35 cm;
 * - rough ground: 9–10/12 landings, ~33 cm.
 * A fixed sequence cannot correct its own rotation in the air (pitch reaches 50–90°), which is why agile
 * jumps are learned (reinforcement learning).
 */
import type { Go1Constants } from '../go1-controller';

/** A leg pose on the vertical line: hip = h + lean, knee = −2h (radians). */
type Pose = { h: number; lean: number };

/** Forward lean of the crouch and the push (radians at the hip). */
const LEAN = 0.6;

/** Phases in control steps (20 ms each). `null` target: the policy acts with a zero command (braking). */
const PHASES: Array<{ name: string; steps: number; pose: Pose | null }> = [
  { name: 'brake', steps: 15, pose: null },
  { name: 'crouch', steps: 10, pose: { h: 1.3, lean: LEAN } },
  { name: 'push', steps: 4, pose: { h: 0.7, lean: LEAN } },
  { name: 'air', steps: 10, pose: { h: 0.9, lean: 0 } },
];

export class Go1Jump {
  private phase = -1;
  private step = 0;

  constructor(private readonly c: Go1Constants) {}

  get active(): boolean {
    return this.phase >= 0;
  }

  get phaseName(): string {
    return this.active ? PHASES[this.phase].name : '';
  }

  start(): void {
    if (!this.active) {
      this.phase = 0;
      this.step = 0;
    }
  }

  cancel(): void {
    this.phase = -1;
  }

  /**
   * The action for this control step: null while braking (the caller runs the policy with a zero command),
   * a fixed joint pose (as a policy-scale action) while crouching, pushing and in the air.
   */
  next(): Float64Array | null {
    const { pose } = PHASES[this.phase];
    let action: Float64Array | null = null;
    if (pose) {
      action = new Float64Array(12);
      for (let i = 0; i < 12; i++) {
        const target = [this.c.default_pose[i], pose.h + pose.lean, -2 * pose.h][i % 3];
        action[i] = (target - this.c.default_pose[i]) / this.c.action_scale;
      }
    }
    if (++this.step >= PHASES[this.phase].steps) {
      this.step = 0;
      this.phase = this.phase + 1 < PHASES.length ? this.phase + 1 : -1;
    }
    return action;
  }
}
