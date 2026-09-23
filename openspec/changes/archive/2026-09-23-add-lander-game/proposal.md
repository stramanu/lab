# Proposal

## Why

The experiment's claim is that the *same* pipeline, network and escalation loop work across games, and that only the environment changes. Snake showed the pattern on a discrete grid with a search planner. The lander is the opposite case: continuous state, physics, inertia, and a System Two that simulates the future (receding-horizon planning with rollouts) instead of searching a graph. It is also the case the design document expects to suit a micro-network best, since the state is compact and fully observable. This is step 5 of the document's work order.

## What Changes

- A headless 2D lander game, written from scratch and deterministic given the seed: gravity, inertia, limited fuel, terrain, landing pad position and wind generated from the seed. A landing counts only below speed and angle limits and on the pad.
- System Two for the lander: a deterministic rollout algorithm (receding-horizon MPC). It explores a small tree of candidate actions with the same physics, lets a hand-written autopilot fly each branch to the end, and scores each first action by the best outcome. Its cost knob is the tree depth, and its cost is counted in simulated physics steps. By construction it is never worse than the autopilot.
- A lander guard: one short rollout of the proposed action to reject moves that lead to a crash within a few tenths of a second, at a tiny fraction of the planner's cost.
- Offline training and evaluation CLIs (`train:lander`, `eval:lander`) that reuse the existing pipeline, hybrid, guard contract and evaluation harness unchanged. Lander-specific metrics: landing rate, fuel used, impact speed, flight time.
- A benchmark of the planner at several knob levels, to pick the default teacher.
- README results for the lander next to Snake, with H1–H4 measured against the same, unchanged targets.

Out of scope: lander in the browser demo (a follow-up change), per-tick compute budget and H5, Tetris.

## Capabilities

### New Capabilities
- `lander-env`: physics, rules, actions, determinism, encoding and episode metrics of the lander game.
- `lander-teacher`: the rollout planner, with per-action scores, adjustable and measurable cost, and reference quality.
- `lander-guard`: the lander's cheap safety check on a proposed action.

### Modified Capabilities
<!-- None: game-interfaces, hybrid-escalation, training-pipeline, micro-policy-net and evaluation-harness are reused as they are. -->

## Impact

- New `src/games/lander/` (config, physics/env, terrain, encoding, teacher, guard) and tests.
- New `scripts/train-lander.ts`, `scripts/eval-lander.ts`, `scripts/bench-lander.ts`, and package scripts.
- `artifacts/lander/` outputs (git-ignored). The evaluation reuses the published seeds 1–200.
- No changes to existing behavior. If shared code needs a generic hook (e.g. the game name in the eval report), it is added without changing Snake's results.
