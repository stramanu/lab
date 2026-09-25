import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BraxPolicy, type BraxPolicyExport } from '../web/applied/brax-policy';

// A random policy with Playground's structure and JAX's actions (applied/mujoco-quadruped/make_policy_fixture.py).
const fixture = JSON.parse(readFileSync(new URL('./fixtures/brax-policy-small.json', import.meta.url), 'utf8')) as BraxPolicyExport & {
  pairs: Array<{ state: number[]; action: number[] }>;
};

describe('brax policy in TypeScript (applied spike A3)', () => {
  it('reproduces JAX deterministic actions within 1e-4', () => {
    const policy = new BraxPolicy(fixture);
    expect(policy.inputSize).toBe(48);
    expect(policy.actionSize).toBe(12);
    let worst = 0;
    for (const p of fixture.pairs) {
      const a = policy.act(p.state);
      p.action.forEach((v, k) => (worst = Math.max(worst, Math.abs(v - a[k]))));
    }
    expect(worst).toBeLessThan(1e-4);
  });
});
