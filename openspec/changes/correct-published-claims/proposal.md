# Proposal

## Why

The repository is public and presented as research. A review of every claim, made after studying Jev
(TypeSafe AI) and Rizzo Flow, which inspired the project, found statements that are wrong, vague or
stronger than the evidence:
- in the write-ups, the site and the code comments;
- in a few specifications that no longer describe the code;
- one reporting bug: H4 said "System One never acted" for racing, when it acted in 3 of the 5 runs.

## What Changes

- **Write-ups and site:**
  - State precisely how the project relates to Jev and Rizzo Flow, with references.
  - Correct the method names:
    - the imitation half of expert iteration only;
    - SafeDAgger-style labelling rather than DAgger;
    - a simplified deep ensemble;
    - a guard that is not a formal shield;
    - rollout's guarantee only where its assumptions hold.
  - Correct the numbers and roundings found by a cross-check against the study files.
  - State that the quadruped's physics uses the Rapier engine.
- **Aggregation:** judge H4 on the runs where System One acted above the threshold, and say so. The
  racing aggregate is regenerated from its cached runs; only its H4 text changes.
- **Training data:** document the dataset's deduplication hash as implemented, clamped to [0, 1] and
  quantized, and its measured false-duplicate rate. The code is unchanged, so the published studies
  stay reproducible.
- **Specifications:** align the warehouse guard, the warehouse teacher's cost, the training dataset and
  in-tab training with the code.

## Capabilities

### New Capabilities

### Modified Capabilities
- `warehouse-guard`: the dead-end rule is described as implemented.
- `warehouse-teacher`: the cost also counts the predicted trajectory steps of the other robots.
- `training-pipeline`: deduplication is by a quantized hash of the clamped encoding.
- `demo-training`: in-tab training is offered only for games whose training fits in a tab (not the quadruped).

## Impact

- **Docs and site:** docs, README, EXPERIMENTS.md, web texts.
- **Code comments:** src, scripts.
- **Evaluation:** `src/eval/aggregate.ts`, with a test; `artifacts/racing/study/study-test-200.json` and
  its published copy.
- No training or evaluation result changes.
