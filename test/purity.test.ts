import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('src/ purity', () => {
  const files = walk(join(__dirname, '..', 'src')).filter((f) => f.endsWith('.ts'));

  it('contains source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not use Math.random or node: imports', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /Math\.random/.test(src) || /from\s+['"]node:/.test(src) || /require\(['"]node:/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
