export interface WarehouseConfig {
  width: number;
  height: number;
  robots: number;
  /** Timesteps per episode (each timestep = one decision per robot). */
  timesteps: number;
}

export const DEFAULT_WAREHOUSE_CONFIG: WarehouseConfig = { width: 32, height: 20, robots: 16, timesteps: 300 };

export const WAIT = 0;
export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 3;
export const WEST = 4;
export const WAREHOUSE_ACTIONS = ['wait', 'north', 'east', 'south', 'west'] as const;
export const DX = [0, 0, 1, 0, -1] as const;
export const DY = [0, -1, 0, 1, 0] as const;
