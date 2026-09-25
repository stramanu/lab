import { Rng } from '../core/rng';
import { mean } from '../core/stats';
import type { ContinuousEnv, ContinuousGuard, ContinuousTeacher, MoveRecord, Player } from '../core/types';
import { TRAIN_SEED_START } from '../eval/seeds';
import { ContinuousHybridPlayer, type AgreementRule } from '../hybrid/continuous';
import { Ensemble, exportEnsemble, importEnsemble, type SerializedEnsemble } from '../nn/ensemble';
import type { LogEntry, Phase } from './pipeline';

export interface ContinuousPipelineConfig {
  seed: number;
  trainSeedStart: number;
  hidden: [number, number];
  members: number;
  datasetCapacity: number;
  validationFraction: number;
  segmentLength: number;
  maxEpisodeSteps: number;
  bootstrapEpisodes: number;
  bootstrapEpochs: number;
  threshold: number;
  auditRate: number;
  useGuard: boolean;
  retrainEvery: number;
  retrainEpochs: number;
  iterations: number;
  maxMovesPerIteration: number;
  consolidationEpochs: number;
}

export const DEFAULT_CONTINUOUS_PIPELINE: ContinuousPipelineConfig = {
  seed: 1,
  trainSeedStart: TRAIN_SEED_START,
  hidden: [64, 64],
  members: 5,
  datasetCapacity: 100_000,
  validationFraction: 0.1,
  segmentLength: 100,
  maxEpisodeSteps: Infinity,
  bootstrapEpisodes: 40,
  bootstrapEpochs: 20,
  threshold: 0.9,
  auditRate: 0.02,
  useGuard: true,
  retrainEvery: 2_000,
  retrainEpochs: 2,
  iterations: 30,
  maxMovesPerIteration: 50_000,
  consolidationEpochs: 5,
};

export interface ContinuousGameSpec {
  name: string;
  makeEnv(): ContinuousEnv;
  teacher: ContinuousTeacher;
  guard?: ContinuousGuard;
  agrees: AgreementRule;
}

/** One planner-driven episode: every state and its label, in order, and the final score. */
export interface PlannerEpisode {
  states: Float32Array[];
  labels: Float64Array[];
  score: number;
}

/**
 * Plays one planner-driven episode, exactly as the bootstrap does. Bootstrap episodes do not depend on
 * the network, so they can be generated anywhere (e.g. worker threads) and replayed with `bootstrapFrom`.
 */
export function plannerEpisode(makeEnv: () => ContinuousEnv, teacher: ContinuousTeacher, seed: number): PlannerEpisode {
  const env = makeEnv();
  env.reset(seed);
  const ep: PlannerEpisode = { states: [], labels: [], score: 0 };
  while (!env.isDone()) {
    const t = teacher.targetAction(env);
    ep.states.push(env.encode());
    ep.labels.push(t.action);
    env.stepContinuous(t.action);
  }
  ep.score = env.score();
  (env as { dispose?: () => void }).dispose?.();
  return ep;
}

/** Planner-driven player used for bootstrap: plays and labels every state. */
class PlannerPlayer implements Player {
  readonly name = 'planner';
  constructor(private readonly teacher: ContinuousTeacher) {}
  act(env: ContinuousEnv): MoveRecord {
    const t = this.teacher.targetAction(env);
    return { action: -1, continuous: t.action, teacherAction: t.action, teacherScores: t.scores, decider: 'system2', cost: t.cost, state: env.encode() };
  }
}

interface Stats {
  moves: number;
  escalated: number;
  guardEscalated: number;
  queried: number;
  agreed: number;
  audited: number;
  auditAgreed: number;
  scores: number[];
  newExamples: number;
}

/**
 * Three-phase training for continuous games, mirroring TrainingPipeline:
 * bootstrap on planner-driven episodes, escalation iterations in which
 * only the states the planner is queried on become regression examples (as in SafeDAgger), consolidation
 * with the confidence map fitted on a validation split by episode segment.
 */
export class ContinuousPipeline {
  readonly config: ContinuousPipelineConfig;
  readonly ensemble: Ensemble;
  readonly log: LogEntry[] = [];
  private xs: Float32Array[] = [];
  private ys: Float64Array[] = [];
  private vxs: Float32Array[] = [];
  private vys: Float64Array[] = [];
  private splitRng: Rng;
  private env: ContinuousEnv | null = null;
  private episodeCounter = 0;
  private episodeStep = 0;
  private segmentIsValidation = false;
  private iteration = 0;
  private lastLoss = NaN;
  private readonly start = performance.now();

  constructor(
    readonly game: ContinuousGameSpec,
    config: Partial<ContinuousPipelineConfig> = {},
    private readonly onLog?: (e: LogEntry) => void,
    /** Fine-tuning: start from these weights (same architecture) instead of random ones. */
    initial?: SerializedEnsemble,
  ) {
    this.config = { ...DEFAULT_CONTINUOUS_PIPELINE, ...config };
    const probe = game.makeEnv();
    (probe as { dispose?: () => void }).dispose?.();
    if (initial) {
      const [h1, h2] = this.config.hidden;
      if (initial.config.inputSize !== probe.encodingSize || initial.config.hidden[0] !== h1 || initial.config.hidden[1] !== h2 || initial.config.members !== this.config.members)
        throw new Error('The initial ensemble does not match the pipeline architecture');
    }
    this.ensemble = initial ? importEnsemble(initial) : new Ensemble({
      inputSize: probe.encodingSize,
      hidden: this.config.hidden,
      low: [...probe.actionLow],
      high: [...probe.actionHigh],
      members: this.config.members,
      seed: this.config.seed,
    });
    this.splitRng = Rng.stream(this.config.seed, 'continuous-split');
  }

  trainingSeeds(): number[] {
    return Array.from({ length: this.episodeCounter }, (_, i) => this.config.trainSeedStart + i);
  }

  private record(move: MoveRecord): boolean {
    if (!move.teacherAction || !move.state) return false;
    if (this.episodeStep % this.config.segmentLength === 0) this.segmentIsValidation = this.splitRng.next() < this.config.validationFraction;
    if (this.segmentIsValidation) {
      this.vxs.push(move.state);
      this.vys.push(move.teacherAction);
      if (this.vxs.length > this.config.datasetCapacity / 5) {
        this.vxs.shift();
        this.vys.shift();
      }
      return false;
    }
    this.xs.push(move.state);
    this.ys.push(move.teacherAction);
    if (this.xs.length > this.config.datasetCapacity) {
      this.xs.shift();
      this.ys.shift();
    }
    return true;
  }

  private play(player: Player, stop: (s: Stats) => boolean): Stats {
    const s: Stats = { moves: 0, escalated: 0, guardEscalated: 0, queried: 0, agreed: 0, audited: 0, auditAgreed: 0, scores: [], newExamples: 0 };
    while (!stop(s)) {
      if (!this.env) {
        this.env = this.game.makeEnv();
        this.env.reset(this.config.trainSeedStart + this.episodeCounter++);
        this.episodeStep = 0;
      }
      const env = this.env;
      const move = player.act(env);
      if (move.decider === 'system2') s.escalated++;
      if (move.escalationReason === 'guard') s.guardEscalated++;
      if (move.agreed !== undefined) {
        s.queried++;
        if (move.agreed) s.agreed++;
        if (move.audited) {
          s.audited++;
          if (move.agreed) s.auditAgreed++;
        }
      }
      if (this.record(move)) s.newExamples++;
      if (move.continuous) env.stepContinuous(move.continuous);
      else env.step(move.action);
      s.moves++;
      this.episodeStep++;
      if (env.isDone() || this.episodeStep >= this.config.maxEpisodeSteps) {
        s.scores.push(env.score());
        (env as { dispose?: () => void }).dispose?.(); // frees WebAssembly worlds (quadruped)
        this.env = null;
      }
    }
    return s;
  }

  private validationAgreement(): number {
    if (!this.vxs.length) return NaN;
    let ok = 0;
    this.vxs.forEach((x, i) => {
      if (this.game.agrees(this.ensemble.decide(x).action, this.vys[i])) ok++;
    });
    return ok / this.vxs.length;
  }

  private calibrate(): void {
    if (this.vxs.length >= 50) this.ensemble.fitConfidence(this.vxs, this.vys, this.game.agrees);
  }

  private emit(phase: Phase, s: Stats | null): LogEntry {
    const entry: LogEntry = {
      phase,
      iteration: this.iteration++,
      loss: this.lastLoss,
      valLoss: this.vxs.length ? this.ensemble.meanSquaredError(this.vxs, this.vys) : NaN,
      valAgreement: this.validationAgreement(),
      agreement: s && s.queried ? s.agreed / s.queried : null,
      auditAgreement: s && s.audited ? s.auditAgreed / s.audited : null,
      escalationRate: s && s.moves ? s.escalated / s.moves : 0,
      guardEscalationRate: s && s.moves ? s.guardEscalated / s.moves : 0,
      meanScore: s && s.scores.length ? mean(s.scores) : null,
      episodes: s ? s.scores.length : 0,
      moves: s ? s.moves : 0,
      datasetSize: this.xs.length,
      validationSize: this.vxs.length,
      calibrationT: 1,
      elapsedMs: Math.round(performance.now() - this.start),
    };
    this.log.push(entry);
    this.onLog?.(entry);
    return entry;
  }

  /** Training seeds of the bootstrap episodes, in the order the sequential bootstrap plays them. */
  bootstrapSeeds(): number[] {
    return Array.from({ length: this.config.bootstrapEpisodes }, (_, i) => this.config.trainSeedStart + this.episodeCounter + i);
  }

  /**
   * Bootstrap from pre-generated planner episodes (one per `bootstrapSeeds()` seed, in order): the same
   * recording, split and training as `bootstrap()`, so the result is identical.
   */
  bootstrapFrom(episodes: PlannerEpisode[]): LogEntry {
    if (this.config.maxEpisodeSteps !== Infinity) throw new Error('bootstrapFrom needs whole episodes (maxEpisodeSteps = Infinity)');
    if (episodes.length !== this.config.bootstrapEpisodes) throw new Error(`bootstrapFrom expects ${this.config.bootstrapEpisodes} episodes (one per bootstrapSeeds() seed), got ${episodes.length}`);
    const s: Stats = { moves: 0, escalated: 0, guardEscalated: 0, queried: 0, agreed: 0, audited: 0, auditAgreed: 0, scores: [], newExamples: 0 };
    for (const ep of episodes) {
      this.episodeCounter++;
      this.episodeStep = 0;
      ep.states.forEach((state, i) => {
        if (this.record({ action: -1, decider: 'system2', cost: 0, state, teacherAction: ep.labels[i] })) s.newExamples++;
        s.moves++;
        this.episodeStep++;
      });
      s.scores.push(ep.score);
    }
    this.env = null;
    this.lastLoss = this.ensemble.train(this.xs, this.ys, this.config.bootstrapEpochs);
    this.calibrate();
    return this.emit('bootstrap', { ...s, escalated: s.moves });
  }

  bootstrap(): LogEntry {
    const s = this.play(new PlannerPlayer(this.game.teacher), (st) => st.scores.length >= this.config.bootstrapEpisodes);
    this.lastLoss = this.ensemble.train(this.xs, this.ys, this.config.bootstrapEpochs);
    this.calibrate();
    return this.emit('bootstrap', { ...s, escalated: s.moves });
  }

  escalationIteration(): LogEntry {
    const hybrid = new ContinuousHybridPlayer(
      this.ensemble,
      this.game.teacher,
      this.game.agrees,
      { threshold: this.config.threshold, auditRate: this.config.auditRate, seed: this.config.seed * 7919 + this.iteration },
      this.config.useGuard ? this.game.guard : undefined,
    );
    const s = this.play(hybrid, (st) => st.newExamples >= this.config.retrainEvery || st.moves >= this.config.maxMovesPerIteration);
    this.lastLoss = this.ensemble.train(this.xs, this.ys, this.config.retrainEpochs);
    this.calibrate();
    return this.emit('escalation', s);
  }

  snapshot(): SerializedEnsemble {
    return exportEnsemble(this.ensemble, { game: this.game.name, iteration: this.iteration });
  }

  consolidate(meta: Record<string, unknown> = {}): SerializedEnsemble {
    this.lastLoss = this.ensemble.train(this.xs, this.ys, this.config.consolidationEpochs);
    this.calibrate();
    this.emit('consolidation', null);
    return exportEnsemble(this.ensemble, {
      game: this.game.name,
      teacher: this.game.teacher.name,
      guard: this.config.useGuard && this.game.guard ? this.game.guard.name : null,
      pipeline: { ...this.config, maxEpisodeSteps: String(this.config.maxEpisodeSteps) },
      trainingEpisodes: this.episodeCounter,
      ...meta,
    });
  }

  /** The whole training; `episodes` replaces the bootstrap's own play with pre-generated planner episodes. */
  run(meta: Record<string, unknown> = {}, episodes?: PlannerEpisode[]): SerializedEnsemble {
    if (episodes) this.bootstrapFrom(episodes);
    else this.bootstrap();
    for (let i = 0; i < this.config.iterations; i++) this.escalationIteration();
    return this.consolidate(meta);
  }
}
