# Tasks

## 1. Guard contract and Snake guard

- [x] 1.1 Add the `Guard` interface and the `escalationReason` / `guardCost` fields of `MoveRecord` to `src/core/types.ts`; verify with `pnpm typecheck`
- [x] 1.2 Implement `SnakeGuard` in `src/games/snake/guard.ts` (simulated step + early-exit tail reachability, counted cost); verify with tests for immediate death, self-trap, safe move, winning move, determinism and non-mutation
- [x] 1.3 Verify with a test that on the states of a teacher-played episode (capped length) the mean guard cost is at most one tenth of the mean teacher cost

## 2. Guarded hybrid

- [x] 2.1 Add the optional guard to `HybridPlayer` (confidence → guard → teacher), recording reason and guard cost; verify with tests "guard rejection", "guard acceptance", "guard not run on low confidence", "cost of a guard-escalated move" and "guard only" (threshold 0)
- [x] 2.2 Verify that the existing hybrid tests (no guard) still pass unchanged

## 3. Training with the guard

- [x] 3.1 Add `GameSpec.guard`, `PipelineConfig.useGuard` (default true) and `guardEscalationRate` to the log; verify with a test that guard-rejected states are labeled and that the log reports the guard share
- [x] 3.2 Wire `SnakeGuard` into `scripts/train-snake.ts` with a `--no-guard` option; verify the reproducibility test still passes and a default `pnpm train:snake` run completes, recording its time and final escalation rates

## 4. Evaluation with the guard

- [x] 4.1 Extend `standardConditions` with guarded hybrids and the guard-only condition, and the runner with escalations by reason and guard cost share; verify with a test that the breakdown sums to the total and that all conditions are present
- [x] 4.2 Evaluate H2 over every hybrid variant (with and without guard), keep H4 on the unguarded primary hybrid at 0.9; verify with synthetic-report tests
- [x] 4.3 Wire the guard into `scripts/eval-snake.ts` and the report table (guard columns); verify by running `pnpm eval:snake` on the new default weights over the 200 seeds

## 5. Wrap-up

- [x] 5.1 Run `pnpm typecheck`, `pnpm test` and `openspec validate add-hybrid-guard --strict`; all green
- [x] 5.2 Update `README.md` with the three-tier architecture, the new results (all hypotheses as measured, targets unchanged) and the ablation; verify the documented commands work from a clean copy
