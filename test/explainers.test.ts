import { beforeAll, describe, expect, it } from 'vitest';
import { GAMES } from '../src/games/registry';
import { EXPLAINERS } from '../web/explainers';

describe('game explainers', () => {
  beforeAll(async () => {
    for (const g of Object.values(GAMES)) await g.init?.();
  });

  it('cover every registered game', () => {
    expect(Object.keys(EXPLAINERS).sort()).toEqual(Object.keys(GAMES).sort());
  });

  it('list input groups that add up to each encoding size', () => {
    for (const [name, e] of Object.entries(EXPLAINERS)) {
      const size = GAMES[name].makeEnv().encodingSize;
      expect(e.inputs.reduce((s, g) => s + g.count, 0), name).toBe(size);
    }
  });
});
