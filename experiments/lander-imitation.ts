/**
 * Claim: on the lander, System One's low agreement with the planner is not a capacity or
 * input problem, and even the hand-written autopilot cannot be imitated confidently.
 * Labels are collected on training seeds; agreement is measured on dev-seed episodes.
 */
import { seedsFor, TRAIN_SEED_START } from '../src/eval';
import { argmax } from '../src/core/types';
import { LanderEnv, pilotAction, padCenter, terrainHeight, windAt } from '../src/games/lander';
import { getGame } from '../src/games/registry';
import { ArrayTrainData, Mlp, Trainer, evaluate, softLabels } from '../src/nn';
import type { ExperimentResult } from './common';

/** 16 standard inputs plus mean wind, wind trend, highest obstacle toward the pad and elapsed time. */
class RichLanderEnv extends LanderEnv {
  override readonly encodingSize: number = 20;
  override encode(out?: Float32Array): Float32Array {
    const v = out ?? new Float32Array(20);
    super.encode(v.subarray(0, 16));
    const s = this.state;
    const w = this.world;
    v[16] = w.wind0 / 0.3;
    v[17] = (windAt(w, s.time + 1, this.config) - windAt(w, s.time, this.config)) / 0.15;
    const pc = padCenter(w);
    let highest = 0;
    for (let x = Math.min(s.x, pc); x <= Math.max(s.x, pc); x += 1) highest = Math.max(highest, terrainHeight(w, x));
    v[18] = (highest - s.y) / 70;
    v[19] = s.time / 40;
    return v;
  }
  override clone(): RichLanderEnv {
    const c = new RichLanderEnv(this.config);
    c.world = this.world;
    Object.assign(c.state, this.state);
    return c;
  }
}

type Labeler = (env: LanderEnv) => { y: Float32Array; action: number };

/** Plays episodes with the labeler's own action and records (encoding, label). */
function collect(seeds: number[], makeEnv: () => LanderEnv, label: Labeler): ArrayTrainData {
  const xs: Float32Array[] = [];
  const ys: Float32Array[] = [];
  const ms: Uint8Array[] = [];
  for (const seed of seeds) {
    const env = makeEnv();
    env.reset(seed);
    while (!env.isDone()) {
      const { y, action } = label(env);
      xs.push(env.encode());
      ys.push(y);
      ms.push(Uint8Array.of(1, 1, 1, 1));
      env.step(action);
    }
  }
  return new ArrayTrainData(xs, ys, ms);
}

function fit(train: ArrayTrainData, val: ArrayTrainData, inputSize: number, hidden: [number, number], epochs: number) {
  const net = new Mlp({ inputSize, hidden, outputSize: 4, seed: 1 });
  const trainer = new Trainer(net, { lr: 1e-3 }, 1);
  for (let e = 0; e < epochs; e++) trainer.train(train, { epochs: 1 });
  return { trainAgreement: evaluate(net, train).agreement, devAgreement: evaluate(net, val).agreement };
}

export function run(): ExperimentResult {
  const game = getGame('lander');
  const teacher = game.makeTeacher(game.referenceLevel);
  const tau = game.pipeline.tau ?? 0.03;
  const trainSeeds = Array.from({ length: 150 }, (_, i) => TRAIN_SEED_START + 500_000 + i);
  const devSeeds = seedsFor('dev', 20);

  const teacherLabel: Labeler = (env) => {
    const { scores } = teacher.score(env);
    return { y: softLabels(scores, [1, 1, 1, 1], tau), action: argmax(scores) };
  };
  const pilotLabel: Labeler = (env) => {
    const action = pilotAction(env.state, env.world, env.config);
    const y = new Float32Array(4);
    y[action] = 1;
    return { y, action };
  };

  console.log('Collecting planner labels…');
  const std = { train: collect(trainSeeds, () => new LanderEnv(), teacherLabel), dev: collect(devSeeds, () => new LanderEnv(), teacherLabel) };
  const rich = { train: collect(trainSeeds, () => new RichLanderEnv(), teacherLabel), dev: collect(devSeeds, () => new RichLanderEnv(), teacherLabel) };
  const pilot = { train: collect(trainSeeds, () => new LanderEnv(), pilotLabel), dev: collect(devSeeds, () => new LanderEnv(), pilotLabel) };

  // How often the autopilot switches action within an episode: a bang-bang controller alternates like PWM.
  let switches = 0;
  let moves = 0;
  const mix = [0, 0, 0, 0];
  for (const seed of devSeeds) {
    const env = new LanderEnv();
    env.reset(seed);
    let prev = -1;
    while (!env.isDone()) {
      const a = pilotAction(env.state, env.world, env.config);
      mix[a]++;
      if (prev !== -1 && a !== prev) switches++;
      prev = a;
      moves++;
      env.step(a);
    }
  }

  console.log('Fitting networks…');
  return {
    claim: 'Lander imitation is limited by action equivalence, not by network capacity or missing inputs.',
    split: 'dev',
    seeds: devSeeds,
    config: { teacher: teacher.name, tau, trainEpisodes: trainSeeds.length, devEpisodes: devSeeds.length, epochs: 40 },
    results: {
      plannerLabels_64x64: fit(std.train, std.dev, 16, [64, 64], 40),
      plannerLabels_256x256: fit(std.train, std.dev, 16, [256, 256], 40),
      plannerLabels_richInputs_64x64: fit(rich.train, rich.dev, 20, [64, 64], 40),
      autopilotLabels_64x64: fit(pilot.train, pilot.dev, 16, [64, 64], 40),
      autopilotLabels_256x256: fit(pilot.train, pilot.dev, 16, [256, 256], 40),
      autopilotActionMix: { none: mix[0] / moves, main: mix[1] / moves, left: mix[2] / moves, right: mix[3] / moves },
      autopilotSwitchRate: switches / moves,
    },
  };
}
