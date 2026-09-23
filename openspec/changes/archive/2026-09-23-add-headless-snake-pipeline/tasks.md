# Tasks

## 1. Project setup

- [x] 1.1 Create `package.json` (ESM, pnpm), strict `tsconfig.json`, Vitest config, `.gitignore` (ignore `artifacts/` except `eval-seeds.json`) and scripts `test`, `typecheck`, `train:snake`, `eval:snake`; verify that `pnpm install`, `pnpm typecheck` and `pnpm test` (with a placeholder test) pass
- [x] 1.2 Implement the `sfc32` PRNG with `splitmix32` seeding and named streams in `src/core/rng.ts`; verify with determinism and rough-distribution tests
- [x] 1.3 Add a test that fails if `Math.random` or `node:` imports appear in `src/`; verify it passes

## 2. Common interfaces

- [x] 2.1 Define the `Env`, `Teacher`, `Student`, `Decision`, `StepResult`, `GameSummary` types in `src/core/` according to the `game-interfaces` spec; verify with `pnpm typecheck`
- [x] 2.2 Implement statistics utilities (mean, median, standard deviation, 95% CI) and a `RandomPlayer`; verify with unit tests

## 3. Snake environment

- [x] 3.1 Implement rules, relative actions, food placement, starvation limit and end-of-episode summary in `src/games/snake/env.ts`; verify with tests for wall, body, vacating tail, left turn, starvation and summary
- [x] 3.2 Verify determinism with a test comparing two episodes with the same seed and actions step by step
- [x] 3.3 Implement the 7x7 egocentric encoding (201 values) in `src/games/snake/encoding.ts`; verify with tests for length, finite values, out-of-grid walls and 90° rotation invariance
- [x] 3.4 Implement textual `render()`; verify with a snapshot test

## 4. Snake teacher (System Two)

- [x] 4.1 Implement BFS to the food, tail reachability check and flood fill with expanded-node counting; verify with tests on hand-built grids
- [x] 4.2 Implement the per-action score with configurable-depth lookahead and cost in units; verify the tests "avoiding immediate death", "preferring the safe path", "cost grows with depth" and "deterministic cost"
- [x] 4.3 Verify with a test (on a subset of seeds) that the teacher reaches an average length at least 10 times the random player's, and measure the mean time per decision at depth 0, 1, 2

## 5. Micro-network

- [x] 5.1 Implement an MLP parametric on `Float32Array`/`Float64Array` with deterministic He init, masked forward and stable softmax; verify the Snake parameter count (17,283) and zero probabilities on illegal actions
- [x] 5.2 Implement backprop for cross-entropy on soft labels (softmax with temperature τ over scores) and gradient checking in Float64; verify maximum relative error < 1e-4
- [x] 5.3 Implement Adam and mini-batch training with deterministic shuffling; verify the loss decreases on a fixed dataset
- [x] 5.4 Implement temperature scaling, 10-bin ECE and reliability diagram data; verify calibrated NLL ≤ NLL at T = 1 and ECE on hand-built cases
- [x] 5.5 Implement JSON serialization (config, temperature, base64 weights); verify the round trip within 1e-6

## 6. Hybrid

- [x] 6.1 Implement the confidence measures (max probability and margin) and the network-based `Student`; verify the 0.6/0.3/0.1 → margin 0.3 case
- [x] 6.2 Implement the hybrid with threshold, escalation, decision log and cost accounting; verify the tests "high confidence", "escalation", "cost of an escalated move", "zero threshold" and threshold > 1 equivalent to the teacher

## 7. Training pipeline

- [x] 7.1 Implement the fixed-capacity ring-buffer dataset with hash-based dedup; verify replacement of the oldest examples and rejection of duplicates
- [x] 7.2 Implement the bootstrap phase and the per-episode validation split; verify the dataset contains the played states net of duplicates
- [x] 7.3 Implement the escalation loop with audit and retraining every M examples, and the per-iteration JSONL logger; verify with a small run that every iteration logs the escalation rate and that audited states are labeled
- [x] 7.4 Implement consolidation (final training, calibration, weight export); verify the produced weights file is reloadable and includes the temperature
- [x] 7.5 Verify reproducibility with a test that runs a reduced pipeline twice and compares weights byte by byte
- [x] 7.6 Write `scripts/train-snake.ts` with CLI options for the main parameters; verify that `pnpm train:snake` completes a default run producing `artifacts/snake/weights.json` and `artifacts/snake/train-log.jsonl`, and record the total time

## 8. Evaluation

- [x] 8.1 Generate and commit `artifacts/eval-seeds.json` (seeds 1–200); verify with a test that it is disjoint from training seeds
- [x] 8.2 Implement the condition runner (Random, System Two at depth 0/1/2, System One, Hybrid at 0.5/0.7/0.8/0.9/0.95, also with margin confidence) with per-condition metrics; verify with a test on a few seeds that the report contains all conditions and required fields
- [x] 8.3 Implement the H1–H4 check with measured values, targets and outcomes; verify with tests on synthetic reports (confirmed and not confirmed cases)
- [x] 8.4 Write `scripts/eval-snake.ts` that writes `artifacts/snake/eval-report.json` and prints the summary table with parameters, weight KB and hardware; verify by running `pnpm eval:snake` on the weights from task 7.6

## 9. Wrap-up

- [x] 9.1 Run `pnpm typecheck`, `pnpm test` and `openspec validate add-headless-snake-pipeline --strict`; all green
- [x] 9.2 Write `README.md` with purpose, commands and the real numbers from the first run (H1–H4 confirmed or not, without touching the targets); verify the documented commands work from a clean checkout
