import { describe, expect, it } from 'vitest';
import { LapTimer } from '../web/laps';

describe('LapTimer', () => {
  it('records last and best lap times', () => {
    const t = new LapTimer();
    t.update(100, 10, 400);
    expect(t.laps).toBe(0);
    expect(t.current(10)).toBe(10);
    t.update(401, 40, 400);
    expect(t.laps).toBe(1);
    expect(t.last).toBe(40);
    expect(t.best).toBe(40);
    t.update(805, 75, 400);
    expect(t.last).toBe(35);
    expect(t.best).toBe(35);
    t.update(1210, 115, 400);
    expect(t.last).toBe(40);
    expect(t.best).toBe(35);
    expect(t.current(120)).toBe(5);
  });
});
