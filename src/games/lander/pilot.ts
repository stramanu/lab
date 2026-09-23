import { LEFT, MAIN, NONE, RIGHT, type LanderConfig } from './config';
import type { ShipState } from './physics';
import { padCenter, terrainHeight, windAt, type World } from './world';

/**
 * Hand-written PD autopilot: steer toward the pad by tilting, hold a descent
 * rate that shrinks with altitude, hover while off the pad and low, level out
 * near the ground. It is the base policy of the MPC rollouts and the recovery
 * policy of the guard, not a player in the experiment.
 */
export function pilotAction(s: ShipState, w: World, cfg: LanderConfig): number {
  const dx = s.x - padCenter(w);
  const halfPad = (w.padX1 - w.padX0) / 2;
  const overPad = Math.abs(dx) < halfPad - 1;
  const ground = terrainHeight(w, Math.max(0, Math.min(cfg.width, s.x)));
  const agl = s.y - ground;
  const abovePad = s.y - w.padY;

  let vxTarget = Math.max(-4, Math.min(4, -0.4 * dx));
  if (agl < 10) vxTarget = Math.max(-1.5, Math.min(1.5, vxTarget)); // arrive slowly
  if (overPad && agl < 6) vxTarget = Math.max(-0.4, Math.min(0.4, -0.3 * dx)); // settle before touchdown
  // Descent rate shrinks with the height above both the pad and the ground below.
  let vyTarget = -Math.max(0.6, Math.min(6, 0.25 * Math.min(abovePad, agl) + 0.3));
  if (!overPad && (agl < 12 || (Math.abs(dx) > 15 && agl < 25))) vyTarget = 0.3; // hold altitude until closer
  if (overPad && agl < 4) vyTarget = -0.8; // gentle touchdown

  // Desired horizontal acceleration, compensating the wind; tilt to get it from the main engine.
  const ax = 1.5 * (vxTarget - s.vx) - windAt(w, s.time, cfg);
  let angleTarget = Math.asin(Math.max(-0.45, Math.min(0.45, -ax / cfg.mainThrust)));
  if (agl < 1) angleTarget = 0;

  const err = s.angle - angleTarget;
  const omegaTarget = -2.5 * err;
  if (s.omega > omegaTarget + 0.35) return RIGHT;
  if (s.omega < omegaTarget - 0.35) return LEFT;
  if (s.vy < vyTarget && Math.abs(err) < 0.35) return MAIN;
  if (Math.abs(err) > 0.05) return err > 0 ? (s.omega > -0.3 ? RIGHT : NONE) : s.omega < 0.3 ? LEFT : NONE;
  return NONE;
}
