import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('parallel evaluation', () => {
  it('reproduces the sequential evaluation exactly (Snake, 6 dev seeds, 4 workers)', () => {
    // Worker threads need tsx's loader, so the check runs as its own process.
    const out = execFileSync('pnpm', ['-s', 'tsx', 'scripts/check-parallel.ts', 'snake', '6', '4'], { encoding: 'utf8' });
    expect(out).toContain('IDENTICAL');
  }, 120_000);
});
