import type { Env, Guard, MoveRecord, Player, Teacher } from '../core/types';
import type { PipelineConfig } from '../training/pipeline';
import { LanderEnv, LanderGuard, LanderTeacher, pilotAction } from './lander';
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
}

/** The lander's hand-written autopilot as a player (one unit per decision, like a forward pass). */
class AutopilotPlayer implements Player {
  readonly name = 'autopilot';
  act(env: Env): MoveRecord {
    const e = env as LanderEnv;
    return { action: pilotAction(e.state, e.world, e.config), decider: 'baseline', cost: 1 };
  }
}

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
};

export function getGame(name: string): GameDefinition {
  const game = GAMES[name];
  if (!game) throw new Error(`Unknown game "${name}". Available: ${Object.keys(GAMES).join(', ')}`);
  return game;
}
