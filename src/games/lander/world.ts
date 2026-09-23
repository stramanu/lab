import { Rng } from '../../core/rng';
import type { LanderConfig } from './config';

/** Immutable, seeded world: terrain, landing pad and wind. Shared by clones. */
export interface World {
  /** Terrain heights at control points spaced `spacing` metres apart. */
  heights: Float64Array;
  spacing: number;
  padX0: number;
  padX1: number;
  padY: number;
  wind0: number;
  windPhase: number;
}

const CONTROL_POINTS = 21;

export function generateWorld(seed: number, cfg: LanderConfig): World {
  const rng = Rng.stream(seed, 'lander-world');
  const spacing = cfg.width / (CONTROL_POINTS - 1);
  const heights = new Float64Array(CONTROL_POINTS);
  for (let i = 0; i < CONTROL_POINTS; i++) heights[i] = 2 + 13 * rng.next();
  const half = cfg.padWidth / 2;
  const padCenter = 15 + (cfg.width - 30) * rng.next();
  const padY = 3 + 9 * rng.next();
  const padX0 = padCenter - half;
  const padX1 = padCenter + half;
  // Flatten every control point near the pad so the terrain meets it without a step.
  for (let i = 0; i < CONTROL_POINTS; i++) {
    const x = i * spacing;
    if (x >= padX0 - spacing && x <= padX1 + spacing) heights[i] = padY;
  }
  const wind0 = (rng.next() * 2 - 1) * 0.3 * cfg.windScale;
  const windPhase = rng.next() * Math.PI * 2;
  return { heights, spacing, padX0, padX1, padY, wind0, windPhase };
}

export function terrainHeight(w: World, x: number): number {
  if (x >= w.padX0 && x <= w.padX1) return w.padY;
  const f = x / w.spacing;
  const i = Math.max(0, Math.min(w.heights.length - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  return w.heights[i] * (1 - t) + w.heights[i + 1] * t;
}

export function windAt(w: World, t: number, cfg: LanderConfig): number {
  return w.wind0 + 0.15 * cfg.windScale * Math.sin((2 * Math.PI * t) / 6 + w.windPhase);
}

export function padCenter(w: World): number {
  return (w.padX0 + w.padX1) / 2;
}
