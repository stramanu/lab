export interface SnakeConfig {
  width: number;
  height: number;
  initialLength: number;
  /** Max consecutive moves without eating before the episode ends. */
  starvationLimit: number;
}

export const DEFAULT_SNAKE_CONFIG: SnakeConfig = {
  width: 20,
  height: 20,
  initialLength: 3,
  starvationLimit: 400,
};

/** Headings in clockwise order. */
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

/** Relative actions. */
export const STRAIGHT = 0;
export const LEFT = 1;
export const RIGHT = 2;
export const SNAKE_ACTIONS = ['straight', 'left', 'right'] as const;

export function turn(heading: number, action: number): number {
  if (action === LEFT) return (heading + 3) & 3;
  if (action === RIGHT) return (heading + 1) & 3;
  return heading;
}

export type SnakeEndReason = 'wall' | 'body' | 'starvation' | 'win';
