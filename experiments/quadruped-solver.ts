/**
 * Why the quadruped uses 4 internal PGS iterations: the standing robot (build pose, joint targets
 * held, no controller, no pushes) under Rapier's default solver and the alternatives tried.
 * Reports the trunk height after 2 s (build height 0.292 m), the tilt, and the physics speed.
 */
import { initQuadrupedPhysics, buildRobot, readRobot, tiltOf, DEFAULT_QUADRUPED_CONFIG } from '../src/games/quadruped';
import type { ExperimentResult } from './common';

const SETTINGS: Array<[number, number]> = [
  [4, 1], // Rapier's default
  [8, 1],
  [16, 1],
  [4, 4], // adopted
  [8, 4],
];

export async function run(): Promise<ExperimentResult> {
  await initQuadrupedPhysics();
  const results = SETTINGS.map(([iterations, pgs]) => {
    const { world, handles } = buildRobot(DEFAULT_QUADRUPED_CONFIG, 0.9);
    world.integrationParameters.numSolverIterations = iterations;
    world.integrationParameters.numInternalPgsIterations = pgs;
    const t0 = performance.now();
    for (let i = 0; i < 400; i++) world.step();
    const stepsPerSecond = 400 / ((performance.now() - t0) / 1000);
    const s = readRobot(world, handles, DEFAULT_QUADRUPED_CONFIG);
    world.free();
    return { iterations, pgs, height: s.pos[1], tiltDeg: (tiltOf(s.rot) * 180) / Math.PI, stepsPerSecond: Math.round(stepsPerSecond) };
  });
  return {
    claim: "Rapier's default solver lets the standing quadruped sag and tilt; 4 × 4 PGS iterations hold it (design.md).",
    split: 'dev',
    seeds: [],
    config: { stiffness: DEFAULT_QUADRUPED_CONFIG.stiffness, damping: DEFAULT_QUADRUPED_CONFIG.damping, friction: 0.9, seconds: 2, buildHeight: 0.292 },
    results: { settings: results, note: 'stepsPerSecond is wall-clock and machine-dependent; heights and tilts are deterministic.' },
  };
}
