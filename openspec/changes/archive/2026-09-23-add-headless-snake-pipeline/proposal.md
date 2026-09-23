# Proposal

## Why

The document "System One in the browser: experiment design" aims to show that a vertical micro-model, trained by an algorithmic System Two, makes most decisions at a fraction of the cost and knows when not to trust itself (hypotheses H1–H4). Before investing in UI, Web Workers and a second game, the method must be validated end-to-end headlessly on Snake, in Node, with reproducible numbers: this is steps 1–3 of the work order proposed in the document.

## What Changes

- New TypeScript project (the repository is currently empty) with automated tests and Node-runnable scripts, without ML libraries.
- Game-agnostic common interfaces `Env`, `Teacher`, `Student`, `Hybrid`, designed to be reused by the lander without changes.
- Headless 20x20 Snake environment, deterministic given the seed, with a 7x7 egocentric encoding for System One.
- System Two for Snake: BFS toward the food with a tail-safety check and adjustable-depth lookahead; returns a score per action and its own cost in compute units.
- Micro MLP written from scratch (forward, backprop, Adam, soft labels, illegal-action masking, temperature scaling, weight serialization) with gradient checking.
- System One / System Two hybrid with a confidence threshold (max probability or margin between the top two actions) that records who made each move.
- Three-phase training pipeline (bootstrap, DAgger-style escalation loop with random audit, consolidation) with per-iteration logs.
- Evaluation harness over 200 fixed seeds disjoint from training seeds, with the four conditions (Random, System Two, System One, Hybrid at several thresholds) and a JSON report of the metrics needed for H1–H4.

Out of scope for this change (later changes): Web Worker and demo UI, lander game and MPC, real-time constraint with per-tick budget (H5), charts, GIF recorder, in-browser LLM.

## Capabilities

### New Capabilities
- `game-interfaces`: game-agnostic common contract for environment, teacher, student and hybrid, including cost accounting in compute units.
- `snake-env`: rules, actions, determinism and state encoding of the headless Snake game.
- `snake-teacher`: System Two planner for Snake that scores every legal action with an adjustable, measurable cost.
- `micro-policy-net`: from-scratch micro MLP with soft-label training, calibration and weight serialization.
- `hybrid-escalation`: hybrid decision with a confidence threshold, escalation to System Two and a decision log.
- `training-pipeline`: three-phase training protocol with dataset, periodic retraining and per-iteration logs.
- `evaluation-harness`: reproducible evaluation of the four experimental conditions on fixed seeds with a metrics report.

### Modified Capabilities
<!-- None: the project has no specs yet. -->

## Impact

- New code in `src/` (core, nn, hybrid, training, eval, games/snake) and tests in `test/`.
- New dev dependencies: `typescript`, `vitest`, `tsx`, `@types/node`. No runtime dependencies.
- New Node CLI scripts for offline training and evaluation; outputs (weights and reports) in `artifacts/`.
- Code in `src/` must stay browser-compatible (no Node APIs outside the CLI scripts), because it will move into the Web Worker in the demo change.
