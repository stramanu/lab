/**
 * Go/no-go spike for the quadruped (add-quadruped-locomotion). Criteria fixed in the proposal before
 * this was run, measured in the order of design.md, on dev seeds only:
 *   1. determinism: an episode run twice, and a restored snapshot continued, are bitwise identical;
 *   2. the base controller walks 20 s without pushes on 20/20 dev seeds, mean forward speed ≥ 0.3 m/s;
 *   (push calibration: the first J in 4, 5, 6, 7, 8, 9, 10, 12 N·s for which the base controller falls
 *    on 20–60% of the 20 dev seeds; if none, stop);
 *   3. with pushes, the level-2 planner falls on at most half as many seeds as the base controller and
 *      covers ≥ 20% more distance;
 *   4. the level-2 planner decides in ≤ 0.25 s on one core;
 *   5. the ensemble agrees with the planner (every component within 0.25) on ≥ 85% of planner-visited dev states;
 *   6. the ensemble's disagreement detects its errors with AUROC ≥ 0.75.
 * v2 (current): the planner's stability term and satisficing margin revised after v1 by rules fixed in
 * design.md ("Revision after spike v1"); v1's result is kept in quadruped-feasibility-v1.json.
 */
import { mean } from '../src/core/stats';
import { seedsFor, TRAIN_SEED_START } from '../src/eval';
import { initQuadrupedPhysics, QuadrupedEnv, QuadrupedTeacher, CANDIDATES } from '../src/games/quadruped';
import { quadrupedAgrees } from '../src/games/registry';
import { Ensemble } from '../src/nn';
import { auroc, type ExperimentResult } from './common';

const ZERO = [0, 0, 0, 0];
const PUSH_CANDIDATES = [4, 5, 6, 7, 8, 9, 10, 12];

/** Trunk pose after every decision of an episode that cycles through the candidates. */
function poseTrace(env: QuadrupedEnv, decisions: number, offset = 0): number[] {
  const out: number[] = [];
  for (let d = 0; d < decisions && !env.isDone(); d++) {
    env.advance(CANDIDATES[(d + offset) % CANDIDATES.length]);
    out.push(...env.robot.pos, env.robot.rot.x, env.robot.rot.y, env.robot.rot.z, env.robot.rot.w);
  }
  return out;
}

function baseEpisode(seed: number, pushImpulse: number): { fell: boolean; distance: number; speed: number } {
  const env = new QuadrupedEnv({ pushImpulse });
  env.reset(seed);
  while (!env.isDone()) env.advance(ZERO);
  const r = { fell: env.end === 'fall', distance: env.score(), speed: env.score() / env.time };
  env.dispose();
  return r;
}

export async function run(): Promise<ExperimentResult> {
  await initQuadrupedPhysics();
  const dev20 = seedsFor('dev', 20);

  // 1. Determinism.
  const a = new QuadrupedEnv({ pushImpulse: 6 });
  const b = new QuadrupedEnv({ pushImpulse: 6 });
  a.reset(dev20[0]);
  b.reset(dev20[0]);
  const repeat = JSON.stringify(poseTrace(a, 200)) === JSON.stringify(poseTrace(b, 200));
  const c = new QuadrupedEnv({ pushImpulse: 6 });
  c.reset(dev20[1]);
  poseTrace(c, 60);
  const copy = c.clone();
  const snapshot = JSON.stringify(poseTrace(c, 100, 7)) === JSON.stringify(poseTrace(copy, 100, 7));
  [a, b, c, copy].forEach((e) => e.dispose());
  console.log(`1. determinism: repeat ${repeat}, snapshot ${snapshot}`);

  // 2. Base controller without pushes.
  const calm = dev20.map((s) => baseEpisode(s, 0));
  const calmFalls = calm.filter((r) => r.fell).length;
  const calmSpeed = mean(calm.map((r) => r.speed));
  console.log(`2. base without pushes: ${calmFalls} falls, ${calmSpeed.toFixed(3)} m/s`);

  // Push calibration, base controller only.
  const calibration: Array<{ impulse: number; fallRate: number }> = [];
  let J: number | null = null;
  for (const impulse of PUSH_CANDIDATES) {
    const fallRate = dev20.map((s) => baseEpisode(s, impulse)).filter((r) => r.fell).length / dev20.length;
    calibration.push({ impulse, fallRate });
    console.log(`   calibration J=${impulse}: base falls on ${(fallRate * 100).toFixed(0)}%`);
    if (fallRate >= 0.2 && fallRate <= 0.6) {
      J = impulse;
      break;
    }
  }
  const header = {
    claim: 'Feasibility of the quadruped experiment (pre-registered go/no-go criteria).',
    split: 'dev' as const,
    seeds: dev20,
  };
  const c1 = { repeat, snapshot, pass: repeat && snapshot };
  const c2 = { falls: calmFalls, meanSpeed: calmSpeed, threshold: '0/20 falls and ≥ 0.3 m/s', pass: calmFalls === 0 && calmSpeed >= 0.3 };
  if (J === null) {
    return { ...header, config: { pushCandidates: PUSH_CANDIDATES }, results: { criterion1_determinism: c1, criterion2_baseWalks: c2, calibration, stopped: 'no push strength gives a 20–60% base fall rate' } };
  }

  // 3–4. Planner (level 2) vs base controller, with pushes.
  const teacher = new QuadrupedTeacher({ horizon: 10 });
  const base = dev20.map((s) => baseEpisode(s, J!));
  const planner: Array<{ fell: boolean; distance: number }> = [];
  const decisionMs: number[] = [];
  for (const seed of dev20) {
    const env = new QuadrupedEnv({ pushImpulse: J });
    env.reset(seed);
    while (!env.isDone()) {
      const t0 = performance.now();
      const { action } = teacher.targetAction(env);
      decisionMs.push(performance.now() - t0);
      env.advance(action);
    }
    planner.push({ fell: env.end === 'fall', distance: env.score() });
    env.dispose();
    console.log(`   planner seed ${seed}: ${planner.at(-1)!.fell ? 'fell' : 'walked'} ${planner.at(-1)!.distance.toFixed(2)} m`);
  }
  const baseFalls = base.filter((r) => r.fell).length;
  const plannerFalls = planner.filter((r) => r.fell).length;
  const distanceRatio = mean(planner.map((r) => r.distance)) / mean(base.map((r) => r.distance));
  const ms = mean(decisionMs);
  console.log(`3. falls base ${baseFalls} vs planner ${plannerFalls}; distance ×${distanceRatio.toFixed(2)}. 4. ${ms.toFixed(0)} ms per decision`);

  // 5–6. Imitation: planner-driven training episodes, 2 DAgger rounds, confidence map, planner-visited dev states.
  const ensemble = new Ensemble({ inputSize: 46, hidden: [64, 64], low: [-1, -1, -1, -1], high: [1, 1, 1, 1], members: 5, seed: 1 });
  const xs: Float32Array[] = [];
  const ys: Float64Array[] = [];
  let episode = 0;
  const trainSeed = () => TRAIN_SEED_START + 900_000 + episode++;
  const collect = (drive: 'planner' | 'ensemble', episodes: number, into: { xs: Float32Array[]; ys: Float64Array[] }) => {
    for (let k = 0; k < episodes; k++) {
      const env = new QuadrupedEnv({ pushImpulse: J! });
      env.reset(trainSeed());
      while (!env.isDone()) {
        const label = teacher.targetAction(env).action;
        into.xs.push(env.encode());
        into.ys.push(label);
        env.advance(drive === 'planner' ? label : ensemble.decide(env.encode()).action);
      }
      env.dispose();
    }
  };
  console.log('Bootstrap: 40 planner-driven training episodes…');
  collect('planner', 40, { xs, ys });
  ensemble.train(xs, ys, 20);
  for (let round = 0; round < 2; round++) {
    console.log(`DAgger round ${round + 1}…`);
    collect('ensemble', 10, { xs, ys });
    ensemble.train(xs, ys, 5);
  }
  const calib = { xs: [] as Float32Array[], ys: [] as Float64Array[] };
  collect('planner', 5, calib);
  ensemble.fitConfidence(calib.xs, calib.ys, quadrupedAgrees);

  const devAgree: boolean[] = [];
  const devDisagreement: number[] = [];
  const dev10 = seedsFor('dev', 10);
  for (const seed of dev10) {
    const env = new QuadrupedEnv({ pushImpulse: J });
    env.reset(seed);
    while (!env.isDone()) {
      const label = teacher.targetAction(env).action;
      const d = ensemble.decide(env.encode());
      devAgree.push(quadrupedAgrees(d.action, label));
      devDisagreement.push(d.disagreement);
      env.advance(label);
    }
    env.dispose();
  }
  const agreement = devAgree.filter(Boolean).length / devAgree.length;
  const detection = auroc(devDisagreement, devAgree.map((x) => !x));
  const baseShare = ys.filter((y) => y.every((v) => v === 0)).length / ys.length;
  console.log(`5. agreement ${(agreement * 100).toFixed(1)}%. 6. AUROC ${detection.toFixed(3)}. Base action in ${(baseShare * 100).toFixed(0)}% of labels`);

  return {
    ...header,
    config: { pushCandidates: PUSH_CANDIDATES, pushImpulse: J, teacher: teacher.name, members: 5, hidden: [64, 64], bootstrapEpisodes: 40, daggerRounds: 2, episodesPerRound: 10, trainingStates: xs.length },
    results: {
      criterion1_determinism: c1,
      criterion2_baseWalks: c2,
      calibration,
      criterion3_plannerHelps: {
        baseFalls,
        plannerFalls,
        baseMeanDistance: mean(base.map((r) => r.distance)),
        plannerMeanDistance: mean(planner.map((r) => r.distance)),
        distanceRatio,
        threshold: 'planner falls ≤ base falls / 2 and distance ratio ≥ 1.2',
        pass: plannerFalls <= baseFalls / 2 && distanceRatio >= 1.2,
      },
      criterion4_decisionTime: { msPerDecision: ms, threshold: '≤ 250 ms', pass: ms <= 250 },
      criterion5_agreement: { value: agreement, threshold: '≥ 0.85', pass: agreement >= 0.85, states: devAgree.length },
      criterion6_errorDetectionAUROC: { value: detection, threshold: '≥ 0.75', pass: detection >= 0.75 },
      baseActionShareOfLabels: baseShare,
      confidenceMap: ensemble.confidenceMap,
    },
  };
}
