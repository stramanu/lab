import { MAIN, LEFT, RIGHT, type LanderConfig, type LanderEndReason } from './config';
import { terrainHeight, windAt, type World } from './world';

/** Flat, mutable physics state: cheap to copy for planner rollouts. */
export interface ShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Tilt in radians, positive = counter-clockwise; 0 = upright. */
  angle: number;
  omega: number;
  fuel: number;
  time: number;
  decisions: number;
  end: LanderEndReason | null;
  /** Speed at ground contact (0 while flying). */
  impactSpeed: number;
}

export function copyState(src: ShipState, dst: ShipState): ShipState {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.angle = src.angle;
  dst.omega = src.omega;
  dst.fuel = src.fuel;
  dst.time = src.time;
  dst.decisions = src.decisions;
  dst.end = src.end;
  dst.impactSpeed = src.impactSpeed;
  return dst;
}

export function emptyState(): ShipState {
  return { x: 0, y: 0, vx: 0, vy: 0, angle: 0, omega: 0, fuel: 0, time: 0, decisions: 0, end: null, impactSpeed: 0 };
}

/**
 * Advances one decision (cfg.stepsPerDecision physics steps, semi-implicit
 * Euler), stopping early at the end of the episode. Returns the number of
 * physics steps simulated (the planner's unit of cost).
 */
export function simulateDecision(s: ShipState, w: World, cfg: LanderConfig, action: number): number {
  if (s.end) return 0;
  const { dt } = cfg;
  let steps = 0;
  for (let k = 0; k < cfg.stepsPerDecision; k++) {
    steps++;
    let ax = windAt(w, s.time, cfg);
    let ay = -cfg.gravity;
    if (s.fuel > 0) {
      if (action === MAIN) {
        ax += -Math.sin(s.angle) * cfg.mainThrust;
        ay += Math.cos(s.angle) * cfg.mainThrust;
        s.fuel = Math.max(0, s.fuel - cfg.mainBurn * dt);
      } else if (action === LEFT) {
        s.omega += cfg.sideAngularAccel * dt;
        s.fuel = Math.max(0, s.fuel - cfg.sideBurn * dt);
      } else if (action === RIGHT) {
        s.omega -= cfg.sideAngularAccel * dt;
        s.fuel = Math.max(0, s.fuel - cfg.sideBurn * dt);
      }
    }
    s.vx += ax * dt;
    s.vy += ay * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += s.omega * dt;
    s.time += dt;

    if (s.x < 0 || s.x > cfg.width || s.y > cfg.height) {
      s.end = 'out';
      break;
    }
    const ground = terrainHeight(w, s.x);
    if (s.y <= ground) {
      s.y = ground;
      s.impactSpeed = Math.hypot(s.vx, s.vy);
      const onPad = s.x >= w.padX0 && s.x <= w.padX1;
      const soft =
        -s.vy <= cfg.maxLandingVy && Math.abs(s.vx) <= cfg.maxLandingVx && Math.abs(s.angle) <= cfg.maxLandingAngle;
      s.end = onPad && soft ? 'landed' : 'crashed';
      break;
    }
  }
  s.decisions++;
  if (!s.end && s.decisions >= cfg.maxDecisions) s.end = 'timeout';
  return steps;
}
