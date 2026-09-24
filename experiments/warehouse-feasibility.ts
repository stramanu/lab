/**
 * Go/no-go spike for the warehouse (add-warehouse-mapf). Criteria fixed in the proposal before measuring:
 *   1. the planner is collision-free and delivers ≥ 20% more than the greedy baseline;
 *   2. exact ties < 20% of the planner's decisions (after tie-breaking);
 *   3. a 64×64 network imitating the planner reaches ≥ 85% agreement on dev states;
 *   4. 1 − confidence separates disagreeing from agreeing states with AUROC ≥ 0.75.
 * τ = smallest preference step / 3 (the rule declared for racing).
 */
import { seedsFor, TRAIN_SEED_START } from '../src/eval';
import { argmax } from '../src/core/types';
import { WarehouseEnv, WarehouseTeacher, greedyAction } from '../src/games/warehouse';
import { ArrayTrainData, Mlp, Trainer, softLabels } from '../src/nn';
import type { ExperimentResult } from './common';

const TAU = 0.02 / 3;
const SUBSAMPLE = 6;

function auroc(scores: number[], positive: boolean[]): number {
  const rows = scores.map((s, i) => ({ s, p: positive[i] })).sort((a, b) => a.s - b.s);
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
    i = j;
  }
  const nNeg = rows.length - nPos;
  return nPos && nNeg ? (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : NaN;
}

export function run(): ExperimentResult {
  const teacher = new WarehouseTeacher();
  const devSeeds = seedsFor('dev', 20);

  // Criteria 1–2.
  let plannerDeliveries = 0;
  let plannerCollisions = 0;
  let greedyDeliveries = 0;
  let decisions = 0;
  let exactTies = 0;
  for (const seed of devSeeds) {
    const env = new WarehouseEnv();
    env.reset(seed);
    while (!env.isDone()) {
      const { scores } = teacher.score(env);
      const sorted = Array.from(scores).sort((a, b) => b - a);
      if (sorted[0] === sorted[1]) exactTies++;
      decisions++;
      env.step(argmax(scores));
    }
    plannerDeliveries += env.deliveries;
    plannerCollisions += env.collisions;
    const g = new WarehouseEnv();
    g.reset(seed);
    while (!g.isDone()) g.step(greedyAction(g));
    greedyDeliveries += g.deliveries;
  }

  // Criteria 3–4: imitation on planner-driven states (subsampled every SUBSAMPLE decisions).
  const collect = (seeds: number[]) => {
    const xs: Float32Array[] = [];
    const ys: Float32Array[] = [];
    const ms: Uint8Array[] = [];
    for (const seed of seeds) {
      const env = new WarehouseEnv();
      env.reset(seed);
      let k = 0;
      while (!env.isDone()) {
        const { scores } = teacher.score(env);
        if (k++ % SUBSAMPLE === 0) {
          xs.push(env.encode());
          ys.push(softLabels(scores, [1, 1, 1, 1, 1], TAU));
          ms.push(Uint8Array.of(1, 1, 1, 1, 1));
        }
        env.step(argmax(scores));
      }
    }
    return new ArrayTrainData(xs, ys, ms);
  };
  const train = collect(Array.from({ length: 40 }, (_, i) => TRAIN_SEED_START + 900_000 + i));
  const dev = collect(seedsFor('dev', 10));
  const net = new Mlp({ inputSize: 252, hidden: [64, 64], outputSize: 5, seed: 1 });
  const trainer = new Trainer(net, { lr: 1e-3 }, 1);
  for (let ep = 0; ep < 30; ep++) trainer.train(train, { epochs: 1 });
  const agree: boolean[] = [];
  const doubt: number[] = [];
  const probs = new Float32Array(5);
  for (let i = 0; i < dev.size; i++) {
    net.probs(dev.x(i), null, 1, probs);
    const choice = argmax(probs);
    agree.push(choice === argmax(dev.y(i)));
    doubt.push(1 - probs[choice]);
  }
  const agreement = agree.filter(Boolean).length / agree.length;
  const detection = auroc(doubt, agree.map((a) => !a));

  const c1ratio = plannerDeliveries / greedyDeliveries;
  const c3 = exactTies / decisions;
  return {
    claim: 'Feasibility of the warehouse (lifelong MAPF) for the System One / System Two method (pre-registered go/no-go criteria).',
    split: 'dev',
    seeds: devSeeds,
    config: { teacher: teacher.name, tau: TAU, subsample: SUBSAMPLE, imitationTrainEpisodes: 40, imitationDevEpisodes: 10, epochs: 30 },
    results: {
      criterion1_collisionFreeAndGain: {
        collisions: plannerCollisions,
        ratio: c1ratio,
        threshold: 'collisions = 0 and ratio ≥ 1.20',
        pass: plannerCollisions === 0 && c1ratio >= 1.2,
        plannerMean: plannerDeliveries / devSeeds.length,
        greedyMean: greedyDeliveries / devSeeds.length,
      },
      criterion2_exactTies: { value: c3, threshold: '< 0.20', pass: c3 < 0.2 },
      criterion3_imitationAgreement: { value: agreement, threshold: '≥ 0.85', pass: agreement >= 0.85, trainStates: train.size, devStates: dev.size },
      criterion4_errorDetectionAUROC: { value: detection, threshold: '≥ 0.75', pass: detection >= 0.75 },
    },
  };
}
