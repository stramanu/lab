/**
 * Go/no-go spike for the continuous System One on racing (add-continuous-student).
 * Criteria fixed in the proposal before this was run:
 *   1. agreement ≥ 85%: ensemble mean within 0.03 rad of the planner's steering target and same pedal sign;
 *   2. error detection: ensemble disagreement separates disagreeing from agreeing states, AUROC ≥ 0.75;
 *   3. alone: the ensemble driving alone stays on track in ≥ 80% of dev episodes.
 * Data: planner-driven training episodes + 2 DAgger rounds (ensemble drives, planner labels).
 */
import { seedsFor, TRAIN_SEED_START } from '../src/eval';
import { mean } from '../src/core/stats';
import { RacingEnv, RacingTeacher, STEER_TOLERANCE, controllerAction, racingAgrees } from '../src/games/racing';
import { Ensemble } from '../src/nn';
import type { ExperimentResult } from './common';

const agrees = racingAgrees;

/** Probability that a random positive scores higher than a random negative (ties count half). */
function auroc(scores: number[], positive: boolean[]): number {
  const rows = scores.map((s, i) => ({ s, p: positive[i] })).sort((a, b) => a.s - b.s);
  let rank = 0;
  let sumPos = 0;
  let nPos = 0;
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && rows[j].s === rows[i].s) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (rows[k].p) {
      sumPos += avgRank;
      nPos++;
    }
    rank = j;
    i = j;
  }
  const nNeg = rows.length - nPos;
  if (!nPos || !nNeg) return NaN;
  void rank;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export function run(): ExperimentResult {
  const teacher = new RacingTeacher();
  const ensemble = new Ensemble({ inputSize: 20, hidden: [64, 64], low: [-0.3, -1], high: [0.3, 1], members: 5, seed: 1 });
  const xs: Float32Array[] = [];
  const ys: Float64Array[] = [];
  let episode = 0;
  const trainSeed = () => TRAIN_SEED_START + 800_000 + episode++;

  const collect = (drive: 'planner' | 'ensemble', episodes: number, into: { xs: Float32Array[]; ys: Float64Array[] }) => {
    for (let k = 0; k < episodes; k++) {
      const env = new RacingEnv();
      env.reset(trainSeed());
      while (!env.isDone()) {
        const label = teacher.targetAction(env).action;
        into.xs.push(env.encode());
        into.ys.push(label);
        if (drive === 'planner') env.stepContinuous(label);
        else env.stepContinuous(ensemble.decide(env.encode()).action);
      }
    }
  };

  console.log('Bootstrap: planner-driven episodes…');
  collect('planner', 40, { xs, ys });
  ensemble.train(xs, ys, 20);
  for (let round = 0; round < 2; round++) {
    console.log(`DAgger round ${round + 1}…`);
    collect('ensemble', 10, { xs, ys });
    ensemble.train(xs, ys, 5);
  }
  const calib = { xs: [] as Float32Array[], ys: [] as Float64Array[] };
  collect('planner', 5, calib);
  ensemble.fitConfidence(calib.xs, calib.ys, agrees);

  // Criteria 1–2 on planner-driven dev states.
  const devAgree: boolean[] = [];
  const devDisagreement: number[] = [];
  for (const seed of seedsFor('dev', 10)) {
    const env = new RacingEnv();
    env.reset(seed);
    while (!env.isDone()) {
      const label = teacher.targetAction(env).action;
      const d = ensemble.decide(env.encode());
      devAgree.push(agrees(d.action, label));
      devDisagreement.push(d.disagreement);
      env.stepContinuous(label);
    }
  }
  const agreement = devAgree.filter(Boolean).length / devAgree.length;
  const detection = auroc(devDisagreement, devAgree.map((a) => !a));

  // Criterion 3: the ensemble alone on dev episodes; the base controller on the same seeds for reference.
  const aloneSeeds = seedsFor('dev', 20);
  let onTrack = 0;
  const aloneProgress: number[] = [];
  const controllerProgress: number[] = [];
  for (const seed of aloneSeeds) {
    const env = new RacingEnv();
    env.reset(seed);
    while (!env.isDone()) env.stepContinuous(ensemble.decide(env.encode()).action);
    if (env.car.end !== 'off-track') onTrack++;
    aloneProgress.push(env.score());
    const c = new RacingEnv();
    c.reset(seed);
    while (!c.isDone()) c.step(controllerAction(c.car, c.track, c.config));
    controllerProgress.push(c.score());
  }
  const c3 = onTrack / aloneSeeds.length;

  return {
    claim: 'Feasibility of a continuous (ensemble-regression) System One on racing (pre-registered go/no-go criteria).',
    split: 'dev',
    seeds: [...seedsFor('dev', 10), ...aloneSeeds],
    config: { teacher: teacher.name, members: 5, hidden: [64, 64], bootstrapEpisodes: 40, daggerRounds: 2, episodesPerRound: 10, steerTolerance: STEER_TOLERANCE, trainingStates: xs.length },
    results: {
      criterion1_agreement: { value: agreement, threshold: '≥ 0.85', pass: agreement >= 0.85, states: devAgree.length },
      criterion2_errorDetectionAUROC: { value: detection, threshold: '≥ 0.75', pass: detection >= 0.75 },
      criterion3_aloneOnTrack: { value: c3, threshold: '≥ 0.80', pass: c3 >= 0.8 },
      aloneMeanProgress: mean(aloneProgress),
      controllerMeanProgress: mean(controllerProgress),
      confidenceMap: ensemble.confidenceMap,
    },
  };
}
