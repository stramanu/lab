# Proposal

## Why

The quadruped's System One was trained on flat ground only, and it perceives nothing of the ground: its
inputs are proprioceptive (attitude, velocities, joints, foot contacts). The planner, instead, simulates
the real physics, so it "sees" any terrain through its rollouts. Uneven ground is therefore a clean test
of three questions that flat ground cannot answer:
- **Transfer.** Does the network still walk outside the world it was trained in?
- **Knowing what it does not know.** Does the ensemble's disagreement rise on terrain it has never seen,
  so that the hybrid hands more decisions to the planner by itself? Deep ensembles are known to be more
  uncertain out of distribution (Lakshminarayanan et al. 2017).
- **Learning from escalations.** Would a night of training on the new terrain close the gap? This change
  only measures the first two; retraining is decided by a rule fixed here (design.md).

## What Changes

- **Terrain, drawn from the seed:**
  - smooth hills across the path, as a heightfield;
  - branches lying on the ground, as fixed cylinders;
  - four kinds: `flat` (default), `hills`, `branches`, `mixed`.
  - Flat terrain adds no collider, and the height and contact readouts are measured from the ground under
    the robot, so flat episodes stay bitwise identical to those of the published study (tested).
- **Spike on dev seeds** (`pnpm exp quadruped-terrain`), with the published network (run 1 of the study),
  unchanged:
  1. calibrate the terrain's difficulty on the planner;
  2. evaluate every condition on every terrain.
- **Page:** a terrain selector next to the pushes switch, with the terrain drawn in the 3D view.

## Capabilities

### New Capabilities

### Modified Capabilities
- `quadruped-env`: optional seeded terrain.
- `demo-ui`: terrain selector for the quadruped.

## Impact

- **Code:** `src/games/quadruped/` (new `terrain.ts`; env, robot, config), a new experiment and its worker,
  `web/quadruped-view.ts`, `web/quadruped-controls.ts`, the System One page.
- **Results:** no published result changes.
