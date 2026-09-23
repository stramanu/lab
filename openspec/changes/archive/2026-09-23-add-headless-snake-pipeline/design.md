# Design

## Context

The repository was empty: this change creates the project from scratch. Constraints from the experiment document (see proposal.md, Why):

- no ML libraries; network and backprop are hand-written in TypeScript;
- everything must later run in a Web Worker, so library code cannot depend on Node APIs;
- reproducible numbers: same seeds, same results;
- the common interface must serve the lander (next change) without modifications.

Available toolchain: Node 22, pnpm 10.

## Goals / Non-Goals

**Goals:**
- Validate the method (H1–H4 on Snake) entirely in Node, with one training command and one evaluation command.
- Cleanly separate library code (`src/`, browser-compatible) from CLI scripts (`scripts/`, Node).
- Make the cost of every decision measurable in deterministic compute units, the basis of the future virtual budget (H5).

**Non-Goals:**
- Vectorized environments and parallelism: the loop stays sequential; vectorization arrives with the Web Worker.
- JS vs WebGL/WebGPU benchmark, UI, charts, GIF, lander, per-tick budget.
- Aggressive planner optimizations beyond what keeps training within a few minutes.

## Decisions

### Project structure
Single ESM package, TypeScript `strict`, tests with Vitest, scripts with `tsx`. All code, comments, tests and documentation are in English.

```
src/
  core/        interfaces (Env, Teacher, Student, Player), rng, stats, shared types
  nn/          mlp, adam, loss, calibration, serialization
  hybrid/      hybrid and confidence measures
  training/    dataset, three-phase pipeline, logger
  eval/        conditions, runner, metrics, hypotheses, report
  games/snake/ env, encoding, teacher, config
scripts/       train-snake.ts, eval-snake.ts (the only place node:fs is used)
test/          one spec file per module
artifacts/     generated outputs (weights, JSONL logs, JSON reports), git-ignored except the seeds
```
Rejected alternative: pnpm workspace monorepo. Premature while there is a single consumer; it can be split when the demo arrives.

### Deterministic PRNG
`sfc32` seeded from an integer via `splitmix32`, with separate streams for environment (food), network (init, shuffle) and pipeline (audit, seed choice). `Math.random` is banned in `src/` (enforced by a grep test). Alternative: a single global stream, rejected because any change in the number of draws in one module would alter all the others.

### Snake
- State: occupancy grid `Uint8Array(400)` plus the body as a ring buffer of indices; heading as an integer 0–3. O(1) step.
- Food is placed uniformly among free cells using the environment stream.
- Default starvation limit = 400 moves (grid cells), configurable.
- Episode score = food eaten (length − initial length 3).
- Encoding (201 values): 7x7 window rotated to the current heading, one-hot over 4 categories (196), food direction in the egocentric frame as 4 values (ahead, behind, left, right; normalized Manhattan distance on the positive side), length / 400.

### Snake teacher (System Two)
For each action `a`, after simulating the move:
1. immediate death → score `-1000` (finite, minimum);
2. BFS from the new head to the food on the post-move grid → distance `d` (or unreachable);
3. safety check: BFS from head to tail (the tail cell counts as reachable) → `tailOk`;
4. flood fill of the reachable area → `area`.

Immediate score (with `area` = reachable cells / free cells):
- tail reachable: `200 + (ate ? 100 : 0) + (d reachable ? 50 − d : 0) + 0.5·area` — distance dominates and area is only a tie-breaker (< 1 point), so a safe move that shortens the path always wins;
- tail unreachable: `(ate ? 100 : 0) + 20·area + (d reachable ? 0.1·(50 − d) : 0)` — maximize the room left.

A win scores `+1000`. After eating, the branch stops, because the new food position is random and must not be known to the planner. The stopped branch is valued as `immediate · Σ_{i=0..k} γ^i`, so it stays comparable with branches that accumulate discounted child scores (without this, lookahead learns to avoid food: depth 1 dropped from 372 to 7 mean score in the first benchmark).
With lookahead depth `k > 0`: `score_k(a) = immediate(a) + γ · max_b score_{k−1}(b)` with γ = 0.9, over simulated states.
Cost = cells popped from BFS/flood-fill queues + simulated states. Default depth 1 (knob exposed; evaluation uses at least 0, 1, 2).

Tie-breaking: the first training run showed that ~22% of teacher decisions are exact ties and ~39% have a top-2 gap below 1 point (e.g. diagonal food: straight and turn are equivalent). With soft labels these become ~50/50 targets, so the student can never be confident there and escalation stalls around 60%. The teacher therefore adds a root-only preference bonus (straight +0.6, left +0.3, right 0): a canonical deterministic policy that is easier to imitate, with gaps below one distance unit so real differences still win.

Rejected alternatives: Hamiltonian cycle (perfect but very slow and without "interesting" choices to distill) and A* (does not change the asymptotic cost on 20x20).

### Micro-network
- MLP `input → 64 → 64 → nActions`, ReLU, deterministic He init. Snake: 201·64+64 + 64·64+64 + 64·3+3 = 17,283 parameters.
- Weights in a single flat `Float32Array` buffer with per-layer views (simple serialization and Adam). The class is parametric on the buffer type: `Float64Array` is used only in the gradient check, so the test can require 1e-4 in double precision without float32 noise.
- Mask: logits of illegal actions set to `-Infinity` before the softmax (stable softmax with max subtraction).
- Soft labels: `softmax(scores / τ)` with default τ = 0.1: real differences (≥ ~1 point) become near one-hot, broken ties (0.3 gap) become ~0.95/0.05; actions at `-1000` get 0. (τ = 10 from the first draft made almost every label near-uniform.)
- Adam (lr 1e-3, β1 0.9, β2 0.999), mini-batch 64, shuffle with the network stream.
- Temperature scaling: log-grid search for T in [0.25, 5] that always includes T = 1, chosen by minimum NLL on the validation set: by construction the NLL does not get worse.
- ECE over 10 bins; "correct" = student argmax equals teacher argmax.
- JSON format: `{ version, config, calibrationT, weights: base64(Float32Array) }` — a few tens of KB.

### Confidence and hybrid
Default: maximum probability; the margin (p1 − p2) is selectable via config and evaluation reports it as a variant. This settles the document's open decision for now without ruling out the comparison. The hybrid records a `{decider, confidence, probs, cost, agreed?}` record per move; `agreed` is known only when the teacher is queried (escalation or audit).

### Training pipeline
- Training seeds from 1,000,000 upward; fixed evaluation seeds 1–200, written to `artifacts/eval-seeds.json` and committed.
- Ring-buffer dataset with default capacity 100,000 (201 float32 per state ≈ 80 MB; 200,000 was too heavy for a browser tab); dedup via FNV-1a hash of the byte-quantized encoding, kept in a `Map` hash → slot and updated when a slot is overwritten.
- Calibration validation set: ~10% of labeled states, split by episode segments of 256 consecutive decisions (not by state) to limit leakage. A per-episode split was dropped because teacher episodes last ~20k moves, so a handful of bootstrap episodes would leave validation empty or badly unbalanced.
- The temperature is re-fitted after every retraining, so escalation during training already uses calibrated confidence.
- Defaults: bootstrap K = 5 episodes (~115k teacher moves, since the depth-1 teacher averages ~390 food per episode) and 5 epochs; escalation loop with threshold 0.9, retraining every M = 2,000 new examples (2 epochs over the whole buffer), 2% audit, for a fixed number of iterations; consolidation 5 epochs.
- JSONL log, one line per iteration; the final summary prints total time.
- Reproducibility: wall-clock time never drives pipeline decisions.

### Evaluation and hypotheses
- Generic runner over `(Env factory, Player)`; each condition is a `Player`. Time per move is measured with `performance.now()` (available in both Node and the browser).
- 95% CI of the mean score with the normal approximation (`1.96·s/√n`).
- Hypothesis checks:
  - H1: mean escalation rate over the last 3 log iterations < 10%.
  - H2: there exists a threshold at which hybrid score ≥ 90% of System Two and mean cost per move ≤ 1/10.
  - H3: System One score / System Two score ≥ 60%.
  - H4: agreement above threshold ≥ 95% at the reference threshold 0.9.
  The reference System Two is the one at the depth used as teacher during training.

## Risks / Trade-offs

- [Teacher too slow makes training long] → default depth 1, cost measured from the first task; if needed reduce K or restrict lookahead to non-lethal actions.
- [Lookahead planner too strong relative to what a 7x7 window sees] → the network has an implicit ceiling; it is measured (H3) and declared, as in the document.
- [Poorly calibrated confidence] → random audit, temperature scaling, margin variant reported in evaluation.
- [Float32 vs gradient check] → gradient check in Float64 on the same parametric implementation.
- [Hash-based dedup with collisions] → rare and harmless collisions (one example lost); no correctness depends on them.
- [Snake already solved well by the planner] → accepted: the document declares it a testbed.

## Open Questions

- Final values of τ, training threshold and lookahead depth: tuned after the first run without changing specs or tasks.
- Final project name and hosting: irrelevant for this headless change.
- Lander vs Tetris as the second game: concerns a later change; the common interface does not constrain it.
