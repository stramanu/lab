import { GAS, MAX_STEER, STEER_LEFT, STEER_RIGHT, STEER_STEP, commandOf, pedalOf, type RacingConfig, type RacingEndReason } from './config';
import { lateralOffset, nearestIndex, wrap, type Track } from './track';

export interface CarState {
  x: number;
  y: number;
  heading: number;
  speed: number;
  steer: number;
  /** Commanded steering angle; the steering servo follows it at a finite rate. */
  steerTarget: number;
  /** Nearest centreline index. */
  index: number;
  /** Forward progress along the centreline (m), unwrapped across laps. */
  progress: number;
  time: number;
  decisions: number;
  end: RacingEndReason | null;
  /** True during the last step if the friction cap was active (for rendering). */
  sliding: boolean;
}

export function emptyCar(): CarState {
  return { x: 0, y: 0, heading: 0, speed: 0, steer: 0, steerTarget: 0, index: 0, progress: 0, time: 0, decisions: 0, end: null, sliding: false };
}

export function copyCar(src: CarState, dst: CarState): CarState {
  dst.x = src.x;
  dst.y = src.y;
  dst.heading = src.heading;
  dst.speed = src.speed;
  dst.steer = src.steer;
  dst.steerTarget = src.steerTarget;
  dst.index = src.index;
  dst.progress = src.progress;
  dst.time = src.time;
  dst.decisions = src.decisions;
  dst.end = src.end;
  dst.sliding = src.sliding;
  return dst;
}

/**
 * One decision of kinematic-bicycle physics (Kong et al. 2015) with a friction
 * cap on lateral acceleration: above μg the car turns less than commanded and
 * scrubs speed. Returns the physics steps simulated.
 */
export function simulateDecision(c: CarState, track: Track, cfg: RacingConfig, action: number): number {
  if (c.end) return 0;
  const command = commandOf(action);
  const change = command === STEER_LEFT ? STEER_STEP : command === STEER_RIGHT ? -STEER_STEP : 0;
  c.steerTarget = Math.max(-MAX_STEER, Math.min(MAX_STEER, c.steerTarget + change));
  const target = c.steerTarget;
  const gas = pedalOf(action) === GAS;
  const { dt } = cfg;
  const cap = cfg.mu * cfg.gravity;
  let steps = 0;
  for (let k = 0; k < cfg.stepsPerDecision; k++) {
    steps++;
    const maxDelta = cfg.steerRate * dt;
    c.steer += Math.max(-maxDelta, Math.min(maxDelta, target - c.steer));

    let accel = gas ? cfg.gas * Math.max(0, 1 - c.speed / cfg.topSpeed) : c.speed > 0 ? -cfg.brake : 0;
    accel -= 0.002 * c.speed * c.speed + (c.speed > 0 ? 0.2 : 0);

    let yawRate = (c.speed * Math.tan(c.steer)) / cfg.wheelbase;
    const lateral = Math.abs(c.speed * yawRate);
    c.sliding = lateral > cap;
    if (c.sliding) {
      yawRate *= cap / lateral;
      accel -= 0.5 * (lateral - cap);
    }
    c.speed = Math.max(0, c.speed + accel * dt);
    c.heading += yawRate * dt;
    c.x += c.speed * Math.cos(c.heading) * dt;
    c.y += c.speed * Math.sin(c.heading) * dt;
    c.time += dt;

    const next = nearestIndex(track, c.x, c.y, c.index);
    let delta = next - c.index;
    if (delta > track.n / 2) delta -= track.n;
    if (delta < -track.n / 2) delta += track.n;
    c.progress += delta * track.spacing;
    c.index = wrap(next, track.n);
    if (Math.abs(lateralOffset(track, c.index, c.x, c.y)) > track.width / 2) {
      c.end = 'off-track';
      break;
    }
  }
  c.decisions++;
  if (!c.end && c.decisions >= cfg.maxDecisions) c.end = 'timeout';
  return steps;
}
