import type { Env } from '../src/core/types';
import { DEFAULT_QUADRUPED_CONFIG, QuadrupedEnv, schedulePushes } from '../src/games/quadruped';
import { $ } from './dom';

/**
 * The quadruped's random-pushes switch (demo only; the experiments always push). Off: the rest of the
 * episode's seeded pushes are dropped and later episodes have none. On: the pushes still due are restored.
 */
export class QuadrupedControls {
  private enabled = true;
  private env: Env | null = null;
  private episodeSeed: () => number = () => 0;
  private readonly input = $<HTMLInputElement>('random-pushes');

  constructor() {
    this.input.addEventListener('change', () => {
      this.enabled = this.input.checked;
      this.apply(true);
    });
  }

  /** Shows the control for the quadruped and applies the switch to its environment. */
  attach(env: Env, episodeSeed: () => number): void {
    this.env = env;
    this.episodeSeed = episodeSeed;
    $('quadruped-controls').hidden = !(env instanceof QuadrupedEnv);
    this.apply(true);
  }

  private apply(now: boolean): void {
    const env = this.env;
    if (!(env instanceof QuadrupedEnv)) return;
    // Later episodes schedule their pushes from the configuration.
    env.config.pushImpulse = this.enabled ? DEFAULT_QUADRUPED_CONFIG.pushImpulse : 0;
    if (!now || !env.world) return;
    // The current episode: the same seeded schedule, from the current time on.
    env.pushes = this.enabled ? schedulePushes(this.episodeSeed(), env.config).filter((p) => p.time > env.time) : [];
    env.nextPush = 0;
  }
}
