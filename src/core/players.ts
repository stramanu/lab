import { Rng } from './rng';
import type { Env, MoveRecord, Player } from './types';

/** Experimental floor: picks uniformly among legal actions, from a stream seeded per episode. */
export class RandomPlayer implements Player {
  readonly name = 'random';
  private rng: Rng;

  constructor(private readonly seed = 0) {
    this.rng = Rng.stream(seed, 'random-player');
  }

  reset(episodeSeed: number): void {
    this.rng = Rng.stream(episodeSeed, `random-player:${this.seed}`);
  }

  act(env: Env): MoveRecord {
    const legal = env.legalActions();
    const options: number[] = [];
    for (let i = 0; i < legal.length; i++) if (legal[i]) options.push(i);
    return { action: options[this.rng.int(options.length)], decider: 'random', cost: 0 };
  }
}
