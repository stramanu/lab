# Proposal

## Why

The training dataset's deduplication hashed each encoding after clamping its values to [0, 1] and
quantizing them to 1/255. Distinct states could therefore be rejected as duplicates. Measured on
planner-driven training episodes, 0.3% of Snake states, 0.1% of lander states and 4.9% of warehouse
states were lost (EXPERIMENTS.md, decision 33). For published research, a known loss of training data
should be fixed rather than only documented.

## What Changes

- A state is rejected only when an identical encoding, compared as float32, is already present. The hash
  now covers the float32 bit patterns and only narrows the comparison.
- The Snake, lander and warehouse studies are re-run from scratch, and so are the Snake experiments that
  train a model (`snake-deaths`, `snake-guard-ablation`, `snake-inputs`). Continuous games (racing,
  quadruped) and the other experiments do not use this dataset, so they are unaffected.
- The write-ups, the site and the published weights are updated with the new numbers. The previous
  results stay in git history.

## Capabilities

### New Capabilities

### Modified Capabilities
- `training-pipeline`: deduplication by exact encoding.

## Impact

- **Code:** `src/training/dataset.ts`, plus a test.
- **Artifacts:** `artifacts/{snake,lander,warehouse}/study/`, `artifacts/experiments/snake-*.json`,
  `web/public/data/`.
- **Docs:** docs, README, EXPERIMENTS.md, the web texts that quote these numbers.
