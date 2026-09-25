import type { Env } from '../src/core/types';
import { DEFAULT_GAIT, DEFAULT_QUADRUPED_CONFIG, DEFAULT_TERRAIN, QuadrupedEnv, schedulePushes, type TerrainKind } from '../src/games/quadruped';
import { $ } from './dom';

/**
 * The quadruped's controls. The random-pushes switch (demo only; the experiments always push): off drops
 * the rest of the episode's seeded pushes and later episodes have none; on restores the pushes still due.
 * The terrain selector restarts the run on seeded terrain of the chosen kind (flat, as in training, by default).
 * The trot speed changes the base controller's commanded speed live (0.4 m/s in training).
 */
export class QuadrupedControls {
  private enabled = false;
  private env: Env | null = null;
  private episodeSeed: () => number = () => 0;
  private readonly input = $<HTMLInputElement>('random-pushes');
  private readonly terrain = $<HTMLSelectElement>('terrain');
  private readonly trot = $<HTMLInputElement>('trot-speed');
  private restart: () => void = () => {};

  constructor() {
    this.enabled = this.input.checked; // off by default; the browser may restore a previous choice
    this.input.addEventListener('change', () => {
      this.enabled = this.input.checked;
      this.apply(true);
    });
    this.trot.addEventListener('input', () => this.applyTrot());
    this.terrain.addEventListener('change', () => {
      this.applyTerrain();
      this.restart();
    });
  }

  /** Shows the controls for the quadruped and applies them to its environment; `restart` replays the run. */
  attach(env: Env, episodeSeed: () => number, restart: () => void): void {
    this.env = env;
    this.episodeSeed = episodeSeed;
    this.restart = restart;
    $('quadruped-controls').hidden = !(env instanceof QuadrupedEnv);
    this.applyTerrain();
    this.applyTrot();
    this.apply(true);
  }

  /** Commanded trot speed, live: the controller, the planner's rollouts and the guard all read it. */
  private applyTrot(): void {
    const v = Number(this.trot.value) || DEFAULT_GAIT.speed;
    $('o-trot').textContent = v.toFixed(2);
    if (this.env instanceof QuadrupedEnv) this.env.gait.speed = v;
  }

  /** Terrain for the next episodes (the calibrated defaults of the terrain spike). */
  private applyTerrain(): void {
    if (!(this.env instanceof QuadrupedEnv)) return;
    this.env.config.terrain = { ...DEFAULT_TERRAIN, kind: this.terrain.value as TerrainKind };
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
