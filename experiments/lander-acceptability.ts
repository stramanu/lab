/**
 * Claim: an "acceptability" head (one sigmoid per action predicting whether the action is within
 * δ of the planner's best, confidence = acceptability of the chosen action) makes System One much
 * stronger on its own, but does not yield a cheap hybrid on the lander.
 * Small self-contained BCE trainer, DAgger-style data collection on training seeds, evaluation on dev seeds.
 */
import { seedsFor, TRAIN_SEED_START } from '../src/eval';
import { Rng } from '../src/core/rng';
import { mean } from '../src/core/stats';
import { argmax, type Env, type MoveRecord, type Player } from '../src/core/types';
import { LanderEnv, LanderGuard } from '../src/games/lander';
import { getGame } from '../src/games/registry';
import { Adam, Mlp } from '../src/nn';
import type { ExperimentResult } from './common';

const DELTA = 1.5;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Binary cross-entropy training of a 4-output MLP (one independent sigmoid per action). */
class AcceptabilityNet {
  readonly net = new Mlp({ inputSize: 16, hidden: [64, 64], outputSize: 4, seed: 1 }, 'f64');
  private adam = new Adam(this.net.numParams, { lr: 1e-3 });
  private rng = new Rng(3);
  readonly xs: Float32Array[] = [];
  readonly ys: Float32Array[] = [];

  probs(x: Float32Array): number[] {
    return Array.from(this.net.logits(x), sigmoid);
  }

  train(epochs: number): void {
    const n = this.net;
    const p = n.params;
    const g = new Float64Array(n.numParams);
    const { w1, b1, w2, b2, w3, b3 } = n.offsets;
    const [n0, n1, n2, n3] = [16, 64, 64, 4];
    const idx = Array.from({ length: this.xs.length }, (_, i) => i);
    const z1 = new Float64Array(n1), a1 = new Float64Array(n1), z2 = new Float64Array(n2), a2 = new Float64Array(n2);
    const d1 = new Float64Array(n1), d2 = new Float64Array(n2), d3 = new Float64Array(n3);
    for (let ep = 0; ep < epochs; ep++) {
      this.rng.shuffle(idx);
      for (let s = 0; s < idx.length; s += 64) {
        g.fill(0);
        const batch = idx.slice(s, s + 64);
        for (const i of batch) {
          const x = this.xs[i];
          const y = this.ys[i];
          for (let j = 0; j < n1; j++) {
            let v = p[b1 + j];
            for (let k = 0; k < n0; k++) v += p[w1 + j * n0 + k] * x[k];
            z1[j] = v;
            a1[j] = v > 0 ? v : 0;
          }
          for (let j = 0; j < n2; j++) {
            let v = p[b2 + j];
            for (let k = 0; k < n1; k++) v += p[w2 + j * n1 + k] * a1[k];
            z2[j] = v;
            a2[j] = v > 0 ? v : 0;
          }
          for (let j = 0; j < n3; j++) {
            let v = p[b3 + j];
            for (let k = 0; k < n2; k++) v += p[w3 + j * n2 + k] * a2[k];
            d3[j] = (sigmoid(v) - y[j]) / batch.length; // dBCE/dz
          }
          d2.fill(0);
          d1.fill(0);
          for (let j = 0; j < n3; j++) {
            g[b3 + j] += d3[j];
            for (let k = 0; k < n2; k++) {
              g[w3 + j * n2 + k] += d3[j] * a2[k];
              d2[k] += p[w3 + j * n2 + k] * d3[j];
            }
          }
          for (let k = 0; k < n2; k++) if (z2[k] <= 0) d2[k] = 0;
          for (let j = 0; j < n2; j++) {
            g[b2 + j] += d2[j];
            for (let k = 0; k < n1; k++) {
              g[w2 + j * n1 + k] += d2[j] * a1[k];
              d1[k] += p[w2 + j * n1 + k] * d2[j];
            }
          }
          for (let k = 0; k < n1; k++) if (z1[k] <= 0) d1[k] = 0;
          for (let j = 0; j < n1; j++) {
            g[b1 + j] += d1[j];
            for (let k = 0; k < n0; k++) g[w1 + j * n0 + k] += d1[j] * x[k];
          }
        }
        this.adam.step(p, g);
      }
    }
  }
}

export function run(): ExperimentResult {
  const game = getGame('lander');
  const teacher = game.makeTeacher(game.referenceLevel);
  const model = new AcceptabilityNet();
  const acceptable = (env: Env) => {
    const { scores } = teacher.score(env);
    const best = Math.max(...scores);
    return Float32Array.from(scores, (s) => (s >= best - DELTA ? 1 : 0));
  };

  class Hybrid implements Player {
    readonly name = 'acceptability-hybrid';
    constructor(private threshold: number, private guard?: LanderGuard) {}
    act(env: Env): MoveRecord {
      const pa = model.probs(env.encode());
      const choice = argmax(pa);
      let cost = 1;
      if (pa[choice] >= this.threshold) {
        if (!this.guard) return { action: choice, decider: 'system1', cost };
        const g = this.guard.check(env as LanderEnv, choice);
        cost += g.cost;
        if (g.ok) return { action: choice, decider: 'system1', cost };
      }
      const t = teacher.score(env);
      return { action: argmax(t.scores), decider: 'system2', cost: cost + t.cost };
    }
  }

  // Bootstrap on planner-played training episodes, then 6 DAgger rounds labelling every visited state.
  let episode = 0;
  const trainSeed = () => TRAIN_SEED_START + 600_000 + episode++;
  for (let i = 0; i < 150; i++) {
    const env = new LanderEnv();
    env.reset(trainSeed());
    while (!env.isDone()) {
      model.xs.push(env.encode());
      model.ys.push(acceptable(env));
      env.step(argmax(teacher.score(env).scores));
    }
  }
  model.train(10);
  const meanAcceptable = mean(model.ys.map((y) => y.reduce((a, b) => a + b, 0)));
  for (let round = 0; round < 6; round++) {
    const player = new Hybrid(0.9);
    for (let i = 0; i < 20; i++) {
      const env = new LanderEnv();
      env.reset(trainSeed());
      while (!env.isDone()) {
        model.xs.push(env.encode());
        model.ys.push(acceptable(env));
        env.step(player.act(env).action);
      }
    }
    model.train(3);
  }

  const seeds = seedsFor('dev', 30);
  const evaluate = (player: Player) => {
    let landed = 0;
    let moves = 0;
    let cost = 0;
    let escalated = 0;
    const scores: number[] = [];
    for (const seed of seeds) {
      const env = new LanderEnv();
      env.reset(seed);
      while (!env.isDone()) {
        const m = player.act(env);
        moves++;
        cost += m.cost;
        if (m.decider === 'system2') escalated++;
        env.step(m.action);
      }
      scores.push(env.score());
      if (env.state.end === 'landed') landed++;
    }
    return { landed: `${landed}/${seeds.length}`, score: mean(scores), costPerMove: cost / moves, escalationRate: escalated / moves };
  };

  const results: Record<string, unknown> = { meanAcceptableActions: meanAcceptable, systemOneAlone: evaluate(new Hybrid(0)) };
  for (const t of [0.8, 0.9, 0.95]) {
    results[`hybrid@${t}`] = evaluate(new Hybrid(t));
    results[`hybrid+guard@${t}`] = evaluate(new Hybrid(t, new LanderGuard()));
  }
  return {
    claim: 'An acceptability head makes System One much stronger alone on the lander, but no threshold gives a cheap, reliable hybrid.',
    split: 'dev',
    seeds,
    config: { delta: DELTA, teacher: teacher.name, bootstrapEpisodes: 150, daggerRounds: 6, episodesPerRound: 20 },
    results,
  };
}
