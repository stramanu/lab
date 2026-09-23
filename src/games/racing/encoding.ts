import type { RacingConfig } from './config';
import type { CarState } from './physics';
import { lateralOffset, maxCurvatureAhead, wrap, type Track } from './track';

const LOOKAHEAD = [5, 10, 20, 30, 45, 60, 80];
const CURVATURE_AT = [10, 20, 30, 45, 60];
const HEADROOM_OVER = [20, 40, 60];
export const RACING_ENCODING_SIZE = 5 + LOOKAHEAD.length + CURVATURE_AT.length + HEADROOM_OVER.length; // 20

/** Egocentric encoding: speed, heading error, offset, commanded steering, the track ahead in the car frame, curvature and speed headroom. */
export function encodeRacing(c: CarState, track: Track, cfg: RacingConfig, out?: Float32Array): Float32Array {
  const v = out ?? new Float32Array(RACING_ENCODING_SIZE);
  const i = c.index;
  const headingError = c.heading - Math.atan2(track.ty[i], track.tx[i]);
  const cos = Math.cos(c.heading);
  const sin = Math.sin(c.heading);
  let k = 0;
  v[k++] = c.speed / 40;
  v[k++] = Math.sin(headingError);
  v[k++] = Math.cos(headingError);
  v[k++] = lateralOffset(track, i, c.x, c.y) / (track.width / 2);
  v[k++] = c.steerTarget / 0.3;
  for (const d of LOOKAHEAD) {
    const j = wrap(i + Math.round(d / track.spacing), track.n);
    // Lateral position of the centreline point d metres ahead, in the car frame (positive = left).
    v[k++] = (-sin * (track.x[j] - c.x) + cos * (track.y[j] - c.y)) / 20;
  }
  for (const d of CURVATURE_AT) v[k++] = track.kappa[wrap(i + Math.round(d / track.spacing), track.n)] * 20;
  for (const d of HEADROOM_OVER) {
    const kmax = maxCurvatureAhead(track, i, d);
    const vmax = kmax > 1e-6 ? Math.sqrt((cfg.mu * cfg.gravity) / kmax) : 60;
    v[k++] = Math.min(2, c.speed / vmax);
  }
  return v;
}
