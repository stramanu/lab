import type { Env } from '../src/core/types';
import { LanderEnv } from '../src/games/lander/env';
import { $ } from './dom';

/** The visitor's extra wind on the lander (demo only; every experiment uses 0). */
export class LanderWind {
  private value = 0;
  private env: Env | null = null;
  private readonly input = $<HTMLInputElement>('wind');

  constructor() {
    this.input.addEventListener('input', () => this.set(Number(this.input.value)));
    $('wind-calm').addEventListener('click', () => this.set(0));
  }

  /** Shows the control for the lander and applies the current wind to its environment. */
  attach(env: Env): void {
    this.env = env;
    $('lander-controls').hidden = !(env instanceof LanderEnv);
    if (env instanceof LanderEnv) env.config.windOffset = this.value;
  }

  private set(v: number): void {
    this.value = v;
    this.input.value = String(v);
    $('o-wind').textContent = v.toFixed(2);
    if (this.env instanceof LanderEnv) this.env.config.windOffset = v;
  }
}
