import { BRAKE, GAS, MAX_STEER, STEER_HOLD, STEER_LEFT, STEER_RIGHT, STEER_STEP, action, type RacingConfig } from './config';
import type { CarState } from './physics';
import { maxCurvatureAhead, wrap, type Track } from './track';

/**
 * Hand-written base controller: pure-pursuit steering (Coulter 1992) turned into
 * incremental commands (move the steering target toward the pure-pursuit angle,
 * hold it when within half a step), and a conservative curvature-limited speed
 * profile (by default 85% of the friction-limited speed over the braking
 * distance ahead). `margin` scales that speed target; the planner also tries
 * more aggressive margins in its rollouts.
 */
export const BASE_MARGIN = 0.85;

export function controllerAction(c: CarState, track: Track, cfg: RacingConfig, margin = BASE_MARGIN): number {
  const lookahead = 6 + 0.35 * c.speed;
  const j = wrap(c.index + Math.round(lookahead / track.spacing), track.n);
  const cos = Math.cos(c.heading);
  const sin = Math.sin(c.heading);
  const dx = track.x[j] - c.x;
  const dy = track.y[j] - c.y;
  const localY = -sin * dx + cos * dy;
  const dist2 = dx * dx + dy * dy || 1;
  const curvature = (2 * localY) / dist2;
  const delta = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(curvature * cfg.wheelbase)));
  const error = delta - c.steerTarget;
  const steer = error > STEER_STEP / 2 ? STEER_LEFT : error < -STEER_STEP / 2 ? STEER_RIGHT : STEER_HOLD;

  const brakingDistance = (c.speed * c.speed) / (2 * cfg.brake) + 10;
  const kmax = maxCurvatureAhead(track, c.index, brakingDistance);
  const target = kmax > 1e-6 ? margin * Math.sqrt((cfg.mu * cfg.gravity) / kmax) : cfg.topSpeed;
  return action(steer, c.speed < target ? GAS : BRAKE);
}
