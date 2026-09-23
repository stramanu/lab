import { Rng } from '../core/rng';
import { mean } from '../core/stats';
import { argmax, type Env, type Guard, type MoveRecord, type Player, type Teacher } from '../core/types';
import { type ConfidenceMeasure } from '../hybrid/confidence';
import { HybridPlayer, NetStudent, TeacherPlayer } from '../hybrid/players';
import { fitTemperature } from '../nn/calibration';
import { softLabels } from '../nn/math';
import { Mlp } from '../nn/mlp';
import { exportPolicy, type SerializedPolicy } from '../nn/serialize';
import { Trainer, evaluate } from '../nn/train';
import { ReplayDataset } from './dataset';

export interface PipelineConfig {
  seed: number;
  /** Training episodes use seeds trainSeedStart, trainSeedStart + 1, ... */
  trainSeedStart: number;
  hidden: [number, number];
  /** Temperature of the softmax that turns teacher scores into soft labels. */
  tau: number;
  lr: number;
  batchSize: number;
  datasetCapacity: number;
  validationCapacity: number;
  /** Probability that an episode segment goes to the validation set. */
  validationFraction: number;
  /** Consecutive decisions forming one split unit (avoids leakage between near-identical states). */
  segmentLength: number;
  /** Hard cap on steps per episode (Infinity = play to the end). */
  maxEpisodeSteps: number;
  bootstrapEpisodes: number;
  bootstrapEpochs: number;
  threshold: number;
  confidence: ConfidenceMeasure;
  auditRate: number;
  /** Use the game's guard (if any) in the escalation-loop hybrid. */
  useGuard: boolean;
  /** Retrain every this many new labeled training examples. */
  retrainEvery: number;
  retrainEpochs: number;
  iterations: number;
  /** Safety valve: end an iteration after this many moves even if few labels were collected. */
  maxMovesPerIteration: number;
  consolidationEpochs: number;
}

export const DEFAULT_PIPELINE: PipelineConfig = {
  seed: 1,
  trainSeedStart: 1_000_000,
  hidden: [64, 64],
  tau: 0.1,
  lr: 1e-3,
  batchSize: 64,
  datasetCapacity: 100_000,
  validationCapacity: 20_000,
  validationFraction: 0.1,
  segmentLength: 256,
  maxEpisodeSteps: Infinity,
  bootstrapEpisodes: 5,
  bootstrapEpochs: 5,
  threshold: 0.9,
  confidence: 'maxProb',
  auditRate: 0.02,
  useGuard: true,
  retrainEvery: 2_000,
  retrainEpochs: 2,
  iterations: 30,
  maxMovesPerIteration: 200_000,
  consolidationEpochs: 5,
};

export type Phase = 'bootstrap' | 'escalation' | 'consolidation';

export interface LogEntry {
  phase: Phase;
  iteration: number;
  /** Mean training loss of the last training call. */
  loss: number;
  valLoss: number;
  /** Student/teacher agreement on the validation set. */
  valAgreement: number;
  /** Agreement on every move where the teacher was queried in this iteration (null if none). */
  agreement: number | null;
  /** Agreement on audited confident moves only (null if none). */
  auditAgreement: number | null;
  /** Fraction of moves decided by System Two in this iteration. */
  escalationRate: number;
  /** Fraction of moves escalated because the guard rejected a confident action. */
  guardEscalationRate: number;
  /** Mean score of episodes completed in this iteration (null if none completed). */
  meanScore: number | null;
  episodes: number;
  moves: number;
  datasetSize: number;
  validationSize: number;
  calibrationT: number;
  elapsedMs: number;
}

export interface GameSpec {
  name: string;
  makeEnv(): Env;
  teacher: Teacher;
  /** Optional cheap check on System One's proposals. */
  guard?: Guard;
}

interface IterationStats {
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
 * Three-phase training (bootstrap imitation, DAgger-style escalation loop,
 * consolidation). Phases are exposed as methods so a Web Worker can drive
 * them step by step; `run()` executes them all.
 */
export class TrainingPipeline {
  readonly config: PipelineConfig;
  readonly net: Mlp;
  readonly student: NetStudent;
  readonly dataset: ReplayDataset;
  readonly validation: ReplayDataset;
  readonly log: LogEntry[] = [];
  private trainer: Trainer;
  private splitRng: Rng;
  private episodeCounter = 0;
  private env: Env | null = null;
  private episodeStep = 0;
  private segmentIsValidation = false;
  private iteration = 0;
  private lastLoss = NaN;
  private readonly start: number;

  constructor(
    readonly game: GameSpec,
    config: Partial<PipelineConfig> = {},
    private readonly onLog?: (entry: LogEntry) => void,
  ) {
    this.config = { ...DEFAULT_PIPELINE, ...config };
    const probe = game.makeEnv();
    this.net = new Mlp({
      inputSize: probe.encodingSize,
      hidden: this.config.hidden,
      outputSize: probe.numActions,
      seed: this.config.seed,
    });
    this.student = new NetStudent(this.net, 1, this.config.confidence);
    this.dataset = new ReplayDataset(this.config.datasetCapacity, probe.encodingSize, probe.numActions);
    this.validation = new ReplayDataset(this.config.validationCapacity, probe.encodingSize, probe.numActions);
    this.trainer = new Trainer(this.net, { lr: this.config.lr }, this.config.seed);
    this.splitRng = Rng.stream(this.config.seed, 'pipeline-split');
    this.start = performance.now();
  }

  /** Seeds used for training episodes so far (for disjointness checks). */
  trainingSeeds(): number[] {
    return Array.from({ length: this.episodeCounter }, (_, i) => this.config.trainSeedStart + i);
  }

  private newEpisode(): Env {
    const env = this.game.makeEnv();
    env.reset(this.config.trainSeedStart + this.episodeCounter++);
    this.episodeStep = 0;
    return env;
  }

  /** Adds a teacher-labeled move to train or validation; returns true if it was a new training example. */
  private record(move: MoveRecord, legal: boolean[]): boolean {
    if (!move.teacherScores || !move.state) return false;
    if (this.episodeStep % this.config.segmentLength === 0) {
      this.segmentIsValidation = this.splitRng.next() < this.config.validationFraction;
    }
    const y = softLabels(move.teacherScores, legal, this.config.tau);
    if (this.segmentIsValidation) {
      this.validation.add(move.state, y, legal);
      return false;
    }
    return this.dataset.add(move.state, y, legal);
  }

  /**
   * Plays with `player` until `stop` says so, labeling every teacher-queried
   * move. Episodes carry over between calls.
   */
  private play(player: Player, stop: (s: IterationStats) => boolean): IterationStats {
    const s: IterationStats = { moves: 0, escalated: 0, guardEscalated: 0, queried: 0, agreed: 0, audited: 0, auditAgreed: 0, scores: [], newExamples: 0 };
    while (!stop(s)) {
      if (!this.env) this.env = this.newEpisode();
      const env = this.env;
      const legal = env.legalActions();
      let move = player.act(env);
      if (!move.state) move = { ...move, state: env.encode() };
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
      if (this.record(move, legal)) s.newExamples++;
      env.step(move.action);
      s.moves++;
      this.episodeStep++;
      if (env.isDone() || this.episodeStep >= this.config.maxEpisodeSteps) {
        s.scores.push(env.score());
        this.env = null;
      }
    }
    return s;
  }

  private calibrate(): number {
    const t = this.validation.size > 0 ? fitTemperature(this.net, this.validation).temperature : 1;
    this.student.temperature = t;
    return t;
  }

  private emit(phase: Phase, s: IterationStats | null): LogEntry {
    const val = evaluate(this.net, this.validation, this.student.temperature);
    const entry: LogEntry = {
      phase,
      iteration: this.iteration++,
      loss: this.lastLoss,
      valLoss: val.loss,
      valAgreement: val.agreement,
      agreement: s && s.queried ? s.agreed / s.queried : null,
      auditAgreement: s && s.audited ? s.auditAgreed / s.audited : null,
      escalationRate: s && s.moves ? s.escalated / s.moves : 0,
      guardEscalationRate: s && s.moves ? s.guardEscalated / s.moves : 0,
      meanScore: s && s.scores.length ? mean(s.scores) : null,
      episodes: s ? s.scores.length : 0,
      moves: s ? s.moves : 0,
      datasetSize: this.dataset.size,
      validationSize: this.validation.size,
      calibrationT: this.student.temperature,
      elapsedMs: Math.round(performance.now() - this.start),
    };
    this.log.push(entry);
    this.onLog?.(entry);
    return entry;
  }

  /** Phase 1: the teacher plays K episodes; every visited state is labeled. */
  bootstrap(): LogEntry {
    const teacherPlayer = new TeacherPlayer(this.game.teacher);
    let episodes = 0;
    const s = this.play(teacherPlayer, (st) => {
      episodes = st.scores.length;
      return episodes >= this.config.bootstrapEpisodes;
    });
    this.lastLoss = this.trainer.train(this.dataset, { epochs: this.config.bootstrapEpochs, batchSize: this.config.batchSize });
    this.calibrate();
    return this.emit('bootstrap', { ...s, escalated: s.moves });
  }

  /** Phase 2, one iteration: the hybrid plays until M new labels, then retrain and recalibrate. */
  escalationIteration(): LogEntry {
    const hybrid = new HybridPlayer(
      this.student,
      this.game.teacher,
      {
        threshold: this.config.threshold,
        auditRate: this.config.auditRate,
        seed: this.config.seed * 7919 + this.iteration,
      },
      this.config.useGuard ? this.game.guard : undefined,
    );
    const s = this.play(
      hybrid,
      (st) => st.newExamples >= this.config.retrainEvery || st.moves >= this.config.maxMovesPerIteration,
    );
    // An interrupted episode's partial score is not counted; the episode continues next iteration.
    this.lastLoss = this.trainer.train(this.dataset, { epochs: this.config.retrainEpochs, batchSize: this.config.batchSize });
    this.calibrate();
    return this.emit('escalation', s);
  }

  /** Phase 3: final training, calibration and frozen weights. */
  consolidate(meta: Record<string, unknown> = {}): SerializedPolicy {
    this.lastLoss = this.trainer.train(this.dataset, { epochs: this.config.consolidationEpochs, batchSize: this.config.batchSize });
    const t = this.calibrate();
    this.emit('consolidation', null);
    return exportPolicy(this.net, t, {
      game: this.game.name,
      teacher: this.game.teacher.name,
      guard: this.config.useGuard && this.game.guard ? this.game.guard.name : null,
      pipeline: { ...this.config, maxEpisodeSteps: String(this.config.maxEpisodeSteps) },
      trainingEpisodes: this.episodeCounter,
      trainSeedRange: [this.config.trainSeedStart, this.config.trainSeedStart + this.episodeCounter - 1],
      ...meta,
    });
  }

  run(meta: Record<string, unknown> = {}): SerializedPolicy {
    this.bootstrap();
    for (let i = 0; i < this.config.iterations; i++) this.escalationIteration();
    return this.consolidate(meta);
  }
}

/** Convenience: teacher argmax for a state, used by tests and tools. */
export function teacherChoice(teacher: Teacher, env: Env): number {
  return argmax(teacher.score(env).scores, env.legalActions());
}
