# Proposal

## Why

The results will be published on GitHub and LinkedIn, so they must stand up to scrutiny. Three gaps in the current protocol, all disclosed in the README, weaken the claims:

1. **Test-set contamination.** Some design decisions were checked on evaluation seeds 1–30.
2. **One training run per game.** The confidence intervals capture evaluation noise, not training randomness.
3. **Claims without committed code.** Several README claims come from throwaway scripts outside the repository: the 28-of-30 death analysis, the input-variant and capacity studies, and the acceptability prototype.

Standard practice in ML evaluation is a held-out test set used only for final numbers, results over multiple training seeds, and code for every reported number. This change adopts it before any new game is added, so that every later result inherits the protocol.

## What Changes

- **Three seed splits, enforced in code.** train (≥ 1,000,000), **dev** (10,001–10,200, for every design decision and ablation) and **test** (1–200, final numbers only). The evaluation CLI defaults to dev and refuses test unless it is asked for explicitly.
- **Multi-seed training.** Every game is trained with 5 training seeds. Final results report the mean across runs with a 95% t-interval, plus per-run values. Hypotheses are judged on the across-run mean and the per-run outcomes are reported too. Planner-only conditions, which do not depend on the weights, are evaluated once and shared.
- **Reproducible experiments.** Every non-headline claim in the README gets a committed script under `experiments/` that runs on the dev split and writes a JSON result under `artifacts/experiments/`:
  - Snake death analysis;
  - Snake input variants;
  - lander imitation diagnostics (capacity, extra inputs, autopilot imitation);
  - acceptability-head prototype.

  Claims that cannot be reproduced this way are removed from the README.
- **Re-validation.** The contaminated decisions (guard vs no guard, input variants, lander teacher choices) are re-run on the dev split and reported as dev results.
- **Experiment log.** `EXPERIMENTS.md` lists, in order, every design decision, the evidence it rested on (script + split) and the resulting commit or archived change.
- **README.** Final tables regenerated from the multi-seed test runs. The limitations section is updated to state what the new protocol fixes and what remains.

Out of scope: new games, demo changes, new methods (for example expert iteration with the student as base policy).

## Capabilities

### New Capabilities
- `research-experiments`: reproducible, split-aware experiment scripts that back every published claim, and the experiment log.

### Modified Capabilities
- `evaluation-harness`: seed splits (train/dev/test) with test gated behind an explicit flag; multi-seed aggregation across training runs with t-intervals; hypotheses judged on the across-run mean.

## Impact

- `src/eval/seeds.ts` (splits), `src/eval/aggregate.ts` (new), `scripts/eval.ts` and `scripts/train.ts` (split and seed options), new `scripts/study.ts` for multi-seed train+eval, new `experiments/*.ts`, `EXPERIMENTS.md`, README.
- About 2–3 hours of compute on the reference machine for the full multi-seed study (5 seeds × 2 games).
- No change to game, planner, network or pipeline behavior.
