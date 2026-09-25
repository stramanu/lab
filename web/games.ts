import type { Env } from '../src/core/types';
import { getGame, type GameDefinition } from '../src/games/registry';
import { SnakeView, type BoardView } from './game-view';
import { LanderView } from './lander-view';
import { RacingView } from './racing-view';
import { QuadrupedView } from './quadruped-view';
import { WarehouseView } from './warehouse-view';

/** How the input layer is laid out in the 3D network view. */
export type InputLayout =
  /** A square egocentric window: `side × side` cells with `channels` one-hot values each, then `extras` scalars. */
  | {
      kind: 'window';
      side: number;
      channels: number;
      extras: number;
      channelVars: string[];
      emptyVar?: string;
      /** Continuous cell values in [0, 1] (e.g. ink coverage), shaded from emptyVar to the channel colour. */
      graded?: boolean;
    }
  /** A labeled column of scalars. */
  | { kind: 'list'; labels: string[] };

/** Everything the page needs to know about a game beyond the shared registry. */
export interface DemoGame {
  def: GameDefinition;
  /** Short line under the title. */
  blurb: string;
  /** Moves per second the page starts at for this game. */
  speed: number;
  createView(canvas: HTMLCanvasElement): BoardView;
  /** CSS aspect ratio of the board. */
  aspect: string;
  input: InputLayout;
  /** Upper bound of the score axis for the training curve. */
  scoreMax: number;
  scoreLabel(env: Env): string;
  /** Shown while the game's network is not published yet: the page marks the game as a preview. */
  preview?: string;
}

export const DEMO_GAMES: DemoGame[] = [
  {
    def: getGame('snake'),
    speed: 35,
    blurb: 'Snake on a 20×20 grid. The network sees a 7×7 window around the head; the planner searches the whole board.',
    createView: (c) => new SnakeView(c),
    aspect: '1 / 1',
    input: { kind: 'window', side: 7, channels: 4, extras: 5, channelVars: ['--panel-edge', '--body', '--ink-3', '--food'] },
    scoreMax: 400,
    scoreLabel: (env) => String(env.score()),
  },
  {
    def: getGame('lander'),
    speed: 35,
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
  {
    def: getGame('warehouse'),
    speed: 90,
    blurb:
      'A fleet of 16 robots carries goods between shelves and stations. Each robot sees a 9×9 window; the planner searches space-time around the predicted paths of the others.',
    createView: (c) => new WarehouseView(c),
    aspect: '8 / 5',
    input: { kind: 'window', side: 9, channels: 3, extras: 9, channelVars: ['--ink-3', '--body', '--food'], emptyVar: '--panel-edge' },
    scoreMax: 140,
    scoreLabel: (env) => String(env.score()),
  },
  {
    def: getGame('racing'),
    speed: 60,
    blurb:
      'Top-down racing on a procedural track with a grip limit. The network outputs continuous steering and pedal (an ensemble of 5); the planner searches discrete commands and simulates the next 4 s.',
    createView: (c) => new RacingView(c),
    aspect: '4 / 3',
    input: {
      kind: 'list',
      labels: ['speed', 'sin Δψ', 'cos Δψ', 'offset', 'steering', 'ahead 5', 'ahead 10', 'ahead 20', 'ahead 30', 'ahead 45', 'ahead 60', 'ahead 80', 'κ 10', 'κ 20', 'κ 30', 'κ 45', 'κ 60', 'headroom 20', 'headroom 40', 'headroom 60'],
    },
    scoreMax: 1600,
    scoreLabel: (env) => `${env.score().toFixed(0)} m`,
  },
  {
    def: getGame('quadruped'),
    speed: 6,
    blurb:
      'A 12-joint quadruped in 3D rigid-body physics (Rapier) trots forward while pushes hit it. The network modulates a hand-written trot (step placement, height, frequency); the planner simulates 21 modulations 1 s ahead.',
    createView: (c) => new QuadrupedView(c),
    aspect: '4 / 3',
    input: {
      kind: 'list',
      labels: [
        'height',
        'gravity x', 'gravity y', 'gravity z',
        'sin yaw', 'cos yaw',
        'vel x', 'vel y', 'vel z',
        'ang x', 'ang y', 'ang z',
        ...['FR', 'FL', 'HR', 'HL'].flatMap((l) => [`${l} abd`, `${l} hip`, `${l} knee`]),
        ...['FR', 'FL', 'HR', 'HL'].flatMap((l) => [`${l} abd′`, `${l} hip′`, `${l} knee′`]),
        'FR contact', 'FL contact', 'HR contact', 'HL contact',
        'sin phase', 'cos phase',
        'last fwd', 'last lat', 'last height', 'last freq',
      ],
    },
    scoreMax: 14,
    scoreLabel: (env) => `${env.score().toFixed(1)} m`,
  },
];

export function demoGame(name: string): DemoGame {
  return DEMO_GAMES.find((g) => g.def.name === name) ?? DEMO_GAMES[0];
}
