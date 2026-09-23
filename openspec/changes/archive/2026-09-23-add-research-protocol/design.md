# Design

## Context

See proposal.md (Why). The current evaluation (`scripts/eval.ts`) takes `--seeds N` from the fixed list 1–200, and nothing prevents using those seeds during development. Training already uses 1,000,000+ with a configurable `seed`, which drives init, shuffling and audit. Planner-only conditions are expensive: Snake depth 2 ≈ 3 min and lander depth 3 ≈ 30 s per 200 seeds. They are independent of the trained weights.

## Goals / Non-Goals

**Goals:** the held-out test split is used once per final study; results carry training variance; every README number traces to committed code.

**Non-Goals:** changing any method; statistical tests beyond t-intervals (pairwise tests between conditions can come later); tuning targets.

## Decisions

### Splits
`src/eval/seeds.ts` exports `SPLITS = { test: 1..200, dev: 10001..10200 }` and `TRAIN_SEED_START = 1_000_000`, plus `seedsFor(split, n?)`. `scripts/eval.ts --split dev|test` defaults to `dev`; `test` requires `--split test` explicitly and prints a notice. The report records `split`. `artifacts/eval-seeds.json` becomes `{ test, dev }`, kept for backward compatibility (the published test list does not change).

### Multi-seed study
`scripts/study.ts --game <g> --runs 5 --split test`:
1. trains runs with pipeline seeds 1..5 into `artifacts/<g>/runs/<k>/`;
2. evaluates the weight-independent conditions (random, planner levels, baselines) once;
3. evaluates the weight-dependent conditions per run;
4. writes `artifacts/<g>/study-<split>.json` with, per condition, the per-run means, the across-run mean and a 95% t-interval (t₀.₉₇₅ with n−1 df, from a small table), and hypotheses judged on the means with a per-run tally.

Training seeds are independent of the evaluation split. Runs use different pipeline seeds, and therefore different training episodes: `trainSeedStart` is offset per run by 100,000.

### Experiments
`experiments/` holds TypeScript scripts run with `pnpm exp <name>`. They are thin, documented and deterministic, and they reuse library code. Each writes `artifacts/experiments/<name>.json` with `{ claim, split, seeds, config, results }`:
- `snake-deaths`: fatal-move analysis of the unguarded hybrid (last confident disagreement vs last savable point);
- `snake-inputs`: encoding variants (7×7, 11×11, +body age/tail/rays). The variant encodings live in the script as `Env` subclasses, not in `src/`;
- `snake-guard-ablation`: hybrid with and without guard across thresholds;
- `lander-imitation`: capacity (64×64 vs 256×256), extra inputs, direct autopilot imitation;
- `lander-acceptability`: the sigmoid acceptability head prototype, with its own small BCE trainer inside the script.

All use dev seeds for evaluation and training seeds for data collection.

### Experiment log
`EXPERIMENTS.md`: a chronological table (date, decision, evidence, split, contaminated?, re-validated result, link to the archived design or commit). Past entries are reconstructed from the OpenSpec archive and this session's records, stated as such.

## Risks / Trade-offs

- [Dev re-validation contradicts an earlier decision] → report it, and open a follow-up change; the published numbers come from the test study either way.
- [Compute time ~2–3 h] → the study script is resumable: it skips runs whose weights and per-run reports already exist.
- [n = 5 gives wide t-intervals] → reported as is; runs can be increased later without code changes.
