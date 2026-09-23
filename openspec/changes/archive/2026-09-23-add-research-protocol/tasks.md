# Tasks

## 1. Seed splits

- [x] 1.1 Implement `SPLITS`, `TRAIN_SEED_START` and `seedsFor` in `src/eval/seeds.ts`, and update `artifacts/eval-seeds.json` to `{ test, dev }`; verify with tests for pairwise disjointness and unchanged test seeds
- [x] 1.2 Add `--split dev|test` to `scripts/eval.ts` (default dev, explicit test with a notice) and record `split` in the report; verify with a test on the split resolution and by running a 2-seed dev evaluation

## 2. Multi-seed study

- [x] 2.1 Implement `src/eval/aggregate.ts` (per-condition across-run mean, t-interval, hypotheses on means with per-run tally); verify with tests on synthetic reports (known t-interval, tally "3/5")
- [x] 2.2 Implement `scripts/study.ts` (train N runs with offset training seeds, shared weight-independent conditions, per-run evaluation, resumable, aggregated JSON and table); verify with a 2-run, 3-seed dev smoke run for each game

## 3. Experiments

- [x] 3.1 Add the `experiments/` runner (`pnpm exp <name>`) with a shared result writer that rejects test seeds; verify with a test that a test seed raises an error
- [x] 3.2 Implement `snake-deaths`, `snake-inputs` and `snake-guard-ablation` on dev seeds; verify each writes its JSON and is deterministic (run twice, compare non-timing fields)
- [x] 3.3 Implement `lander-imitation` and `lander-acceptability` on dev seeds; verify as in 3.2

## 4. Final study and write-up

- [x] 4.1 Run the full studies (`--runs 5 --split test`) for Snake and lander; verify both aggregated JSON files exist with 5 runs per condition
- [x] 4.2 Write `EXPERIMENTS.md` (chronological decisions, evidence, split, contamination, re-validation); verify every README claim links to a study or experiment result
- [x] 4.3 Regenerate the README results and limitations from the study and experiment outputs, removing any claim without a committed source; verify numbers match the JSON files

## 5. Wrap-up

- [x] 5.1 Run `pnpm typecheck`, `pnpm test`, `pnpm build` and `openspec validate add-research-protocol --strict`; all green
