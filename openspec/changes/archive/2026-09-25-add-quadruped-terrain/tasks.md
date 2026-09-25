# Tasks

## 1. Terrain

- [x] 1.1 `terrain.ts`: seeded hills and branches, analytic surface, colliders; env and robot readouts from the ground below; flat bitwise identical (checked against the previous code on full episodes)
- [x] 1.2 Tests: flat default and determinism, slope bound, physics matches the analytic surface, snapshots on terrain

## 2. Spike (dev seeds)

- [x] 2.1 `experiments/quadruped-terrain.ts` with a worker pool: calibration by the rule in design.md, then every condition on every terrain
- [x] 2.2 Record the result and the retraining decision in EXPERIMENTS.md and docs/systemone.md

## 3. Page

- [x] 3.1 Terrain selector in the quadruped controls; terrain in the 3D view; note that the network was trained on flat ground
- [x] 3.2 Verify in the browser; typecheck, tests, build, strict validation; archive, commit, push, deploy
