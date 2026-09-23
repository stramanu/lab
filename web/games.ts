import type { Env } from '../src/core/types';
import { getGame, type GameDefinition } from '../src/games/registry';
import { SnakeView, type BoardView } from './game-view';
import { LanderView } from './lander-view';

/** How the input layer is laid out in the 3D network view. */
export type InputLayout =
  /** A square egocentric window: `side × side` cells with `channels` one-hot values each, then `extras` scalars. */
  | { kind: 'window'; side: number; channels: number; extras: number; channelVars: string[] }
  /** A labeled column of scalars. */
  | { kind: 'list'; labels: string[] };

/** Everything the page needs to know about a game beyond the shared registry. */
export interface DemoGame {
  def: GameDefinition;
  /** Short line under the title. */
  blurb: string;
  createView(canvas: HTMLCanvasElement): BoardView;
  /** CSS aspect ratio of the board. */
  aspect: string;
  input: InputLayout;
  /** Upper bound of the score axis for the training curve. */
  scoreMax: number;
  scoreLabel(env: Env): string;
}

export const DEMO_GAMES: DemoGame[] = [
  {
    def: getGame('snake'),
    blurb: 'Snake on a 20×20 grid. The network sees a 7×7 window around the head; the planner searches the whole board.',
    createView: (c) => new SnakeView(c),
    aspect: '1 / 1',
    input: { kind: 'window', side: 7, channels: 4, extras: 5, channelVars: ['--panel-edge', '--body', '--ink-3', '--food'] },
    scoreMax: 400,
    scoreLabel: (env) => String(env.score()),
  },
  {
    def: getGame('lander'),
    blurb: 'A 2D lander with gravity, inertia, fuel and wind. The network sees 16 numbers; the planner simulates the future.',
    createView: (c) => new LanderView(c),
    aspect: '10 / 7',
    input: {
      kind: 'list',
      labels: ['Δx pad', 'height', 'vx', 'vy', 'sin θ', 'cos θ', 'ω', 'fuel', 'wind', 'ground −8', 'ground −4', 'ground 0', 'ground +4', 'ground +8', 'on pad', 'altitude'],
    },
    scoreMax: 150,
    scoreLabel: (env) => (env.isDone() ? env.score().toFixed(0) : '–'),
  },
];

export function demoGame(name: string): DemoGame {
  return DEMO_GAMES.find((g) => g.def.name === name) ?? DEMO_GAMES[0];
}
