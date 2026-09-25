# Proposal

## Why

The terrain spike (EXPERIMENTS.md, decision 37) met the retraining rule fixed before it ran. On hills, the
flat-trained System One alone covers only 70–73% of the planner's distance, although its confidence drops
there and the hybrid escalates more. The question now is the third one of that spike: **does the network
learn the new terrain from its own escalations?** In other words, does the System One / System Two loop,
restarted on a new distribution, close the gap?

## What Changes

- **Terrain `varied`.** Each seed draws its kind (flat, hills, branches or mixed) uniformly from its own
  stream, then the terrain itself as before.
- **Fine-tuning in the continuous pipeline.** An optional initial ensemble to start from, instead of random
  weights.
- **The study (`pnpm tsx scripts/terrain-study.ts`), resumable.** For each of 5 runs:
  1. start from the published flat network of the same run;
  2. bootstrap on planner episodes on varied terrain;
  3. run the escalation loop on varied terrain;
  4. consolidate.
  - Then evaluate the old and the new networks on the test split, on flat and mixed terrain, against
    targets fixed in design.md.

## Capabilities

### New Capabilities

### Modified Capabilities
- `quadruped-env`: `varied` terrain.
- `training-pipeline`: optional initial weights for continuous games.

## Impact

- **Code:** `src/games/quadruped/terrain.ts`, `src/training/continuous-pipeline.ts`, a new study script and
  its worker, tests.
- **Results:** new results in `artifacts/quadruped/terrain-study/`. No published result changes.
