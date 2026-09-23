# Proposal

## Why

The first Snake run left the hybrid far from usable: 85 points against the teacher's 384, with H1–H3 not confirmed. A diagnosis of 30 hybrid deaths showed that in 28 of them the last point where the teacher could still save the game is exactly the last move System One played confidently (≥ 0.9) against the teacher's choice. Confidence measures how ambiguous a choice looks, not how costly a mistake would be. In Snake the ~2% confident errors land on critical states, where one wrong move traps the snake many moves later. Richer inputs did not fix this: an 11x11 window, body age, tail direction and obstacle rays moved System One only from 37 to 48 points. Adding a cheap safety check on the move System One proposes did fix it (prototype on the existing weights, 30 seeds): the hybrid jumped to 375 points (98% of the teacher) at 3.4x lower cost per move, or 362 points (94%) at 8.7x lower cost. The first goal is a working Snake, so this change makes that check a first-class part of the hybrid.

## What Changes

- New game-agnostic **guard** contract: a cheap, deterministic verification of one proposed action, which accepts or rejects it and reports its own cost in compute units.
- Snake guard: after simulating the proposed move, reject it if it is immediately lethal or if the tail is no longer reachable from the head (one early-exit BFS).
- Hybrid gains an optional guard stage between System One and System Two: intuition proposes, the guard verifies, and the planner runs only when confidence is low or the guard rejects. Each move records why it escalated (`confidence` or `guard`), and its cost includes the guard.
- Training: the escalation loop plays with the guarded hybrid (default on), so DAgger labels the states where the guard catches System One. The student learns from exactly the traps it walks into.
- Evaluation: adds guarded hybrid conditions at every threshold and a guard-only condition (threshold 0), keeps the unguarded ones as an ablation, reports escalations by reason and the guard's share of cost, and evaluates H2 over all hybrid variants.
- Targets H1–H4 are unchanged. A "working Snake" is defined as H2 holding for the guarded hybrid (≥ 90% of the teacher score at ≥ 10x lower mean cost per move).

Out of scope: learned risk heads (tested: +30 points only), larger or richer encodings (tested: +11 points at most), browser demo, lander.

## Capabilities

### New Capabilities
- `snake-guard`: the Snake-specific safety check on a proposed action and its cost.

### Modified Capabilities
- `game-interfaces`: adds the guard contract.
- `hybrid-escalation`: the decision rule, decision log and extreme-threshold behavior account for the optional guard.
- `training-pipeline`: the escalation loop uses the guarded hybrid and labels guard-triggered escalations.
- `evaluation-harness`: new guarded and guard-only conditions, escalation breakdown by reason, guard cost share, and H2 over all hybrid variants.

## Impact

- New `src/games/snake/guard.ts`; changes to `src/core/types.ts`, `src/hybrid/players.ts`, `src/training/pipeline.ts`, `src/eval/*`, both CLI scripts and the README.
- The weights format is unchanged; existing weights can be evaluated with the guard, but the default run retrains with it.
- No new dependencies.
