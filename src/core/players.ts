import { Rng } from './rng';
import type { Env, MoveRecord, Player } from './types';

/** Experimental floor: picks uniformly among legal actions. */
export class RandomPlayer implements Player {
  readonly name = 'random';
  private rng: Rng;

  constructor(seed = 0) {
    this.rng = Rng.stream(seed, 'random-player');
  }

  act(env: Env): MoveRecord {
    const legal = env.legalActions();
    const options: number[] = [];
    for (let i = 0; i < legal.length; i++) if (legal[i]) options.push(i);
    return { action: options[this.rng.int(options.length)], decider: 'random', cost: 0 };
  }
}
