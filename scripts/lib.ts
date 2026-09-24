/** Shared helpers for the Node CLIs (training, evaluation, studies, experiments). */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import { continuousConditions, runCondition, standardConditions, type Condition, type ConditionResult } from '../src/eval';
import type { GameDefinition } from '../src/games/registry';
import type { ConfidenceMeasure } from '../src/hybrid';
import { importEnsemble, importPolicy, type Ensemble, type Mlp, type SerializedEnsemble, type SerializedPolicy } from '../src/nn';
import { ContinuousPipeline, TrainingPipeline, type ContinuousPipelineConfig, type LogEntry, type PipelineConfig } from '../src/training';

export function hardware(): Record<string, string | number> {
  const cpu = cpus();
  return {
    cpu: cpu[0]?.model ?? 'unknown',
    cores: cpu.length,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    platform: `${platform()}-${arch()}`,
    node: process.version,
  };
}

const fmt = (v: number | null, d = 3) => (v === null || Number.isNaN(v) ? '   -  ' : v.toFixed(d));

export function formatLogEntry(e: LogEntry): string {
  return (
    `[${e.phase.padEnd(13)}] it=${String(e.iteration).padStart(3)} loss=${fmt(e.loss)} valLoss=${fmt(e.valLoss)} ` +
    `valAgree=${fmt(e.valAgreement)} esc=${fmt(e.escalationRate)} guard=${fmt(e.guardEscalationRate)} audit=${fmt(e.auditAgreement)} ` +
    `score=${fmt(e.meanScore, 1)} eps=${e.episodes} moves=${e.moves} data=${e.datasetSize}/${e.validationSize} ` +
    `T=${e.calibrationT.toFixed(2)} t=${(e.elapsedMs / 1000).toFixed(1)}s`
  );
}

/** Trains a game and writes `weights.json` and `train-log.jsonl` into `outDir`. */
export function trainGame(
  game: GameDefinition,
  overrides: Partial<PipelineConfig>,
  outDir: string,
  level: number,
  quiet = false,
): { policy: SerializedPolicy | SerializedEnsemble; seconds: number; numParams: number; json: string } {
  mkdirSync(outDir, { recursive: true });
  const logPath = join(outDir, 'train-log.jsonl');
  writeFileSync(logPath, '');
  const onLog = (e: LogEntry) => {
    appendFileSync(logPath, JSON.stringify(e) + '\n');
    if (!quiet) console.log(formatLogEntry(e));
  };
  if (game.continuous) {
    const c = game.continuous;
    const pipeline = new ContinuousPipeline(
      { name: game.name, makeEnv: c.makeEnv, teacher: c.makeTeacher(level), guard: c.makeGuard(), agrees: c.agrees },
      { ...c.pipeline, ...(overrides as Partial<ContinuousPipelineConfig>) },
      onLog,
    );
    const t0 = performance.now();
    const policy = pipeline.run({ teacherLevel: level });
    const seconds = (performance.now() - t0) / 1000;
    policy.meta = { ...policy.meta, trainingSeconds: Number(seconds.toFixed(1)) };
    const json = JSON.stringify(policy);
    writeFileSync(join(outDir, 'weights.json'), json);
    return { policy, seconds, numParams: pipeline.ensemble.members.reduce((a, m) => a + m.numParams, 0), json };
  }
  const pipeline = new TrainingPipeline(
    { name: game.name, makeEnv: game.makeEnv, teacher: game.makeTeacher(level), guard: game.makeGuard() },
    { ...game.pipeline, ...overrides },
    onLog,
  );
  const t0 = performance.now();
  const policy = pipeline.run({ teacherLevel: level });
  const seconds = (performance.now() - t0) / 1000;
  policy.meta = { ...policy.meta, trainingSeconds: Number(seconds.toFixed(1)) };
  const json = JSON.stringify(policy);
  writeFileSync(join(outDir, 'weights.json'), json);
  return { policy, seconds, numParams: pipeline.net.numParams, json };
}

export interface LoadedModel {
  /** Discrete games: the policy network and its calibration temperature. */
  net?: Mlp;
  calibrationT: number;
  /** Continuous games: the regression ensemble. */
  ensemble?: Ensemble;
  /** Total parameters (all members for an ensemble). */
  params: number;
  meta: Record<string, unknown> | undefined;
  raw: string;
}

export function loadModel(dir: string): LoadedModel | null {
  const path = join(dir, 'weights.json');
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw) as SerializedPolicy | SerializedEnsemble;
  if (data.format === 'systemone-ensemble') {
    const ensemble = importEnsemble(data);
    return { ensemble, calibrationT: 1, params: ensemble.members.reduce((a, m) => a + m.numParams, 0), meta: data.meta, raw };
  }
  const { net, calibrationT, meta } = importPolicy(data);
  return { net, calibrationT, params: net.numParams, meta, raw };
}

/** Escalation rate of every escalation iteration in a training log, if the log exists. */
export function trainingEscalation(dir: string): number[] | undefined {
  const path = join(dir, 'train-log.jsonl');
  if (!existsSync(path)) return undefined;
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry)
    .filter((e) => e.phase === 'escalation')
    .map((e) => e.escalationRate);
}

export interface ConditionOptions {
  levels: number[];
  referenceLevel: number;
  measures: ConfidenceMeasure[];
  guard: boolean;
}

/** Standard conditions plus the game's baselines. */
export function gameConditions(game: GameDefinition, model: LoadedModel, o: ConditionOptions): Condition[] {
  if (model.ensemble && game.continuous) {
    const c = game.continuous;
    const conditions = continuousConditions({
      makeTeacher: c.makeTeacher,
      levels: o.levels,
      referenceLevel: o.referenceLevel,
      ensemble: model.ensemble,
      agrees: c.agrees,
      guard: o.guard ? c.makeGuard() : undefined,
    });
    for (const b of game.baselines) conditions.push({ name: b.name, kind: 'baseline', params: {}, makePlayer: b.makePlayer });
    return conditions;
  }
  const conditions = standardConditions({
    makeTeacher: game.makeTeacher,
    levels: o.levels,
    referenceLevel: o.referenceLevel,
    net: model.net!,
    temperature: model.calibrationT,
    measures: o.measures,
    guard: o.guard ? game.makeGuard() : undefined,
  });
  for (const b of game.baselines) conditions.push({ name: b.name, kind: 'baseline', params: {}, makePlayer: b.makePlayer });
  return conditions;
}

/** Conditions whose results do not depend on the trained weights. */
export const isWeightIndependent = (c: Condition) => c.kind === 'random' || c.kind === 'system2' || c.kind === 'baseline';

export function runConditions(game: GameDefinition, conditions: Condition[], seeds: number[], referenceLevel: number, quiet = false): ConditionResult[] {
  const oracle = game.continuous ? game.continuous.makeTeacher(referenceLevel) : game.makeTeacher(referenceLevel);
  return conditions.map((c) => {
    const t0 = performance.now();
    const r = runCondition(c, { makeEnv: game.makeEnv, seeds, oracle, agrees: game.continuous?.agrees });
    if (!quiet) console.log(`${c.name.padEnd(28)} score=${r.score.mean.toFixed(1)} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    return r;
  });
}
