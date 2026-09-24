import type { ContinuousEnv, ContinuousGuard, ContinuousTeacher, Env, Guard, MoveRecord, Player, Teacher } from '../core/types';
import type { AgreementRule } from '../hybrid/continuous';
import type { ContinuousPipelineConfig } from '../training/continuous-pipeline';
import type { PipelineConfig } from '../training/pipeline';
import { LanderEnv, LanderGuard, LanderTeacher, pilotAction } from './lander';
import { RacingEnv, RacingGuard, RacingTeacher, controllerAction, racingAgrees } from './racing';
import { SnakeEnv, SnakeGuard, SnakeTeacher } from './snake';

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
}

export interface ContinuousSpec {
  makeEnv(): ContinuousEnv;
  makeTeacher(level: number): ContinuousTeacher;
  makeGuard(): ContinuousGuard;
  agrees: AgreementRule;
  /** Names of the continuous action dimensions. */
  actionLabels: string[];
  pipeline: Partial<ContinuousPipelineConfig>;
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
};

export function getGame(name: string): GameDefinition {
  const game = GAMES[name];
  if (!game) throw new Error(`Unknown game "${name}". Available: ${Object.keys(GAMES).join(', ')}`);
  return game;
}
