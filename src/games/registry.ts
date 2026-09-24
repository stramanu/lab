import type { ContinuousEnv, ContinuousGuard, ContinuousTeacher, Env, Guard, MoveRecord, Player, Teacher } from '../core/types';
import type { AgreementRule } from '../hybrid/continuous';
import type { ContinuousPipelineConfig } from '../training/continuous-pipeline';
import type { PipelineConfig } from '../training/pipeline';
import { LanderEnv, LanderGuard, LanderTeacher, pilotAction } from './lander';
import { ACTION_LABELS, initQuadrupedPhysics, QuadrupedEnv, QuadrupedGuard, QuadrupedTeacher } from './quadruped';
import { RacingEnv, RacingGuard, RacingTeacher, controllerAction, racingAgrees } from './racing';
import { SnakeEnv, SnakeGuard, SnakeTeacher } from './snake';
import { WarehouseEnv, WarehouseGuard, WarehouseTeacher, greedyAction } from './warehouse';

/** An extra, non-experimental reference player shown next to the conditions. */
export interface Baseline {
  name: string;
  makePlayer(): Player;
}

/** Everything the generic CLIs (and later the demo) need to know about a game. */
export interface GameDefinition {
  name: string;
  title: string;
  makeEnv(): Env;
  /** System Two at a given cost-knob level. */
  makeTeacher(level: number): Teacher;
  /** Knob levels evaluated for System Two alone. */
  levels: number[];
  /** Knob level of the teacher used in training (and by the hybrid). */
  referenceLevel: number;
  makeGuard(): Guard;
  /** Game-specific training defaults on top of the pipeline defaults. */
  pipeline: Partial<PipelineConfig>;
  baselines: Baseline[];
  /** Present for continuous-control games: System One is a regression ensemble. */
  continuous?: ContinuousSpec;
  /** One-time asynchronous setup (e.g. a WebAssembly physics engine), awaited before `makeEnv`. */
  init?: () => Promise<unknown>;
}

export interface ContinuousSpec {
  makeEnv(): ContinuousEnv;
  makeTeacher(level: number): ContinuousTeacher;
  makeGuard(): ContinuousGuard;
  agrees: AgreementRule;
  /** Names of the continuous action dimensions. */
  actionLabels: string[];
  pipeline: Partial<ContinuousPipelineConfig>;
  /** Generate bootstrap episodes on worker threads (identical result; for slow planners). */
  parallelBootstrap?: boolean;
  /** Label every n-th decision for agreement and calibration in evaluations (default 1). */
  oracleEvery?: number;
}

/** The lander's hand-written autopilot as a player (one unit per decision, like a forward pass). */
class AutopilotPlayer implements Player {
  readonly name = 'autopilot';
  act(env: Env): MoveRecord {
    const e = env as LanderEnv;
    return { action: pilotAction(e.state, e.world, e.config), decider: 'baseline', cost: 1 };
  }
}

/** The racing base controller as a player (one unit per decision). */
class BaseControllerPlayer implements Player {
  readonly name = 'base controller';
  act(env: Env): MoveRecord {
    const e = env as RacingEnv;
    return { action: controllerAction(e.car, e.track, e.config), decider: 'baseline', cost: 1 };
  }
}

/** The warehouse greedy baseline as a player (O(1) per decision; counted as 1 unit). */
class GreedyPlayer implements Player {
  readonly name = 'greedy';
  act(env: Env): MoveRecord {
    return { action: greedyAction(env as WarehouseEnv), decider: 'baseline', cost: 1 };
  }
}

/** The quadruped's base controller (the zero action) as a player (one unit per decision). */
class QuadrupedBasePlayer implements Player {
  readonly name = 'base controller';
  act(): MoveRecord {
    return { action: 0, decider: 'baseline', cost: 1 };
  }
}

/** Quadruped planner knob: rollout horizon of 5 · 2^(level − 1) decisions (0.5 / 1 / 2 s). */
const quadrupedTeacher = (level: number) => new QuadrupedTeacher({ horizon: 5 * 2 ** (level - 1) });

/** Declared agreement rule for the quadruped: every action component within 0.25 (half the candidate grid's spacing). */
export const quadrupedAgrees = (a: ArrayLike<number>, b: ArrayLike<number>) => Array.from(a).every((v, i) => Math.abs(v - b[i]) <= 0.25);

/** Racing planner knob: rollout horizon of 20 decisions per level (2 / 4 / 8 s). */
const racingTeacher = (level: number) => new RacingTeacher({ horizon: 20 * level });

export const GAMES: Record<string, GameDefinition> = {
  snake: {
    name: 'snake',
    title: 'Snake',
    makeEnv: () => new SnakeEnv(),
    makeTeacher: (level) => new SnakeTeacher({ depth: level }),
    levels: [0, 1, 2],
    referenceLevel: 1,
    makeGuard: () => new SnakeGuard(),
    pipeline: {},
    baselines: [],
  },
  lander: {
    name: 'lander',
    title: 'Lander',
    makeEnv: () => new LanderEnv(),
    makeTeacher: (level) => new LanderTeacher({ depth: level }),
    levels: [1, 2, 3],
    referenceLevel: 2,
    makeGuard: () => new LanderGuard(),
    pipeline: { tau: 0.03, bootstrapEpisodes: 100 },
    baselines: [{ name: 'autopilot', makePlayer: () => new AutopilotPlayer() }],
  },
  warehouse: {
    name: 'warehouse',
    title: 'Warehouse',
    makeEnv: () => new WarehouseEnv(),
    makeTeacher: (level) => new WarehouseTeacher({ window: 4 * 2 ** (level - 1) }),
    levels: [1, 2, 3],
    referenceLevel: 2,
    makeGuard: () => new WarehouseGuard(),
    pipeline: { tau: 0.02 / 3 },
    baselines: [{ name: 'greedy', makePlayer: () => new GreedyPlayer() }],
  },
  racing: {
    name: 'racing',
    title: 'Racing',
    makeEnv: () => new RacingEnv(),
    makeTeacher: racingTeacher,
    levels: [1, 2, 3],
    referenceLevel: 2,
    makeGuard: () => new RacingGuard(),
    pipeline: {},
    baselines: [{ name: 'base controller', makePlayer: () => new BaseControllerPlayer() }],
    continuous: {
      makeEnv: () => new RacingEnv(),
      makeTeacher: racingTeacher,
      makeGuard: () => new RacingGuard(),
      agrees: racingAgrees,
      actionLabels: ['steering', 'pedal'],
      pipeline: {},
    },
  },
  quadruped: {
    name: 'quadruped',
    title: 'Quadruped',
    init: initQuadrupedPhysics,
    makeEnv: () => new QuadrupedEnv(),
    makeTeacher: quadrupedTeacher,
    levels: [1, 2, 3],
    referenceLevel: 2,
    makeGuard: () => new QuadrupedGuard(),
    pipeline: {},
    baselines: [{ name: 'base controller', makePlayer: () => new QuadrupedBasePlayer() }],
    continuous: {
      makeEnv: () => new QuadrupedEnv(),
      makeTeacher: quadrupedTeacher,
      makeGuard: () => new QuadrupedGuard(),
      agrees: quadrupedAgrees,
      actionLabels: [...ACTION_LABELS],
      // Fixed before the study (design.md, "Study after the exploratory follow-up"): the planner takes
      // 0.18 s per label, so the pipeline is sized in hundreds of episodes, not tens of thousands of moves.
      pipeline: { hidden: [256, 256], bootstrapEpisodes: 400, bootstrapEpochs: 6, iterations: 5, maxMovesPerIteration: 4000, retrainEvery: 2000, retrainEpochs: 2 },
      parallelBootstrap: true,
      oracleEvery: 4,
    },
  },
};

export function getGame(name: string): GameDefinition {
  const game = GAMES[name];
  if (!game) throw new Error(`Unknown game "${name}". Available: ${Object.keys(GAMES).join(', ')}`);
  return game;
}
