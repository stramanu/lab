# Proposal

## Why

The terrain spike (EXPERIMENTS.md, decision 37) showed that the quadruped's System One is blind to the
ground. Its inputs are proprioceptive only, and on hills it covers 70–73% of the planner's distance. The
planner sees the terrain through its physics rollouts. Real legged robots close this gap with
exteroception, a height scan or a depth camera, taught by a privileged teacher (Lee et al. 2020; Miki et
al. 2022; Agarwal et al. 2022).

In this lab's terms: System Two, which sees everything, teaches a System One that gets a sensor. The
rationale is written in `docs/proposals/quadruped-vision.md`.

## What Changes

- **An optional height scan in the quadruped's encoding:**
  - a grid of ground heights around the trunk, in the trunk's heading frame, relative to the trunk;
  - 11 × 7 points, 10 cm apart, from 0.2 m behind to 0.8 m ahead and ±0.3 m across.
  - Off by default, so the encoding (46 values), the published networks and every result are unchanged.
- **Spike (exploratory, dev seeds), `pnpm exp quadruped-height-scan`.** The same planner-labelled data
  trains two ensembles: one blind (the 46 proprioceptive values) and one with the scan (46 + 77). Both
  are compared on varied terrain against criteria fixed in design.md.

## Capabilities

### New Capabilities

### Modified Capabilities
- `quadruped-env`: optional height-scan sensor.

## Impact

- **Code:** `src/games/quadruped/` (env, config, sensor), one experiment, tests.
- **Results:** no published result changes.
