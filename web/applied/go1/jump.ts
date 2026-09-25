/**
 * A jump with the Go1's own legs, hand-written (not learned): the walking policy brakes, then the motors
 * follow a fixed sequence (crouch, push, legs back under the body in the air), then the policy takes over
 * again to land and walk on. Tuned in simulation on the page's scenes (12 episodes per setting):
 * - standing: ~11 cm of trunk rise, 12/12 landings;
 * - on rough ground at 0.5 and 0.8 m/s, with the 300 ms brake: 12/12 and 11/12 landings, ~10 cm.
 * Higher sequences (15–50 cm) made the robot pitch up to ~90° in the air and fall: a fixed sequence cannot
 * correct its own rotation, which is why agile jumps are learned (reinforcement learning).
 */
import type { Go1Constants } from '../go1-controller';

type Pose = { front: [number, number]; rear: [number, number] };

/** Phases in control steps (20 ms each). `null` target: the policy acts with a zero command (braking). */
const PHASES: Array<{ name: string; steps: number; pose: Pose | null }> = [
  { name: 'brake', steps: 15, pose: null },
  { name: 'crouch', steps: 10, pose: { front: [1.2, -2.4], rear: [1.2, -2.4] } },
  { name: 'push', steps: 4, pose: { front: [0.95, -1.7], rear: [1.05, -2.3] } },
  { name: 'air', steps: 10, pose: { front: [0.9, -1.8], rear: [0.9, -1.8] } },
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
        const [hip, knee] = Math.floor(i / 3) < 2 ? pose.front : pose.rear;
        const target = [this.c.default_pose[i], hip, knee][i % 3];
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
