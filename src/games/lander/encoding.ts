import type { LanderConfig } from './config';
import type { ShipState } from './physics';
import { padCenter, terrainHeight, windAt, type World } from './world';

export const LANDER_ENCODING_SIZE = 16;
const PROBES = [-8, -4, 0, 4, 8];

/** Egocentric encoding: everything relative to the pad or to the ship. */
export function encodeLander(s: ShipState, w: World, cfg: LanderConfig, out?: Float32Array): Float32Array {
  const v = out ?? new Float32Array(LANDER_ENCODING_SIZE);
  const H = cfg.height;
  v[0] = (s.x - padCenter(w)) / 50;
  v[1] = (s.y - w.padY) / H;
  v[2] = s.vx / 10;
  v[3] = s.vy / 10;
  v[4] = Math.sin(s.angle);
  v[5] = Math.cos(s.angle);
  v[6] = s.omega / 3;
  v[7] = s.fuel / cfg.fuel;
  v[8] = windAt(w, s.time, cfg) / 0.5;
  for (let i = 0; i < PROBES.length; i++) {
    const px = Math.max(0, Math.min(cfg.width, s.x + PROBES[i]));
    v[9 + i] = (terrainHeight(w, px) - s.y) / H;
  }
  v[14] = s.x >= w.padX0 && s.x <= w.padX1 ? 1 : 0;
  v[15] = (s.y - terrainHeight(w, Math.max(0, Math.min(cfg.width, s.x)))) / H;
  return v;
}
