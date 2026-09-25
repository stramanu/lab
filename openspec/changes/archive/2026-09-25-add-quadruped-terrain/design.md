# Design

## Context

The robot starts at x = 0 and walks along +x for 20 s (about 5–10 m). The network, the planner, the guard
and the pushes are unchanged.

## Decisions

### Terrain

- **Hills.** Raised-cosine bumps across the path, 2–4 m long, placed one after another from x = 1.5 m with
  gaps of 0–1.5 m. Each draws its steepest slope in [0.5, 1] × `maxSlopeDeg`, and a gentle modulation
  across the path (≤ 20% of its height; the steepest slope along the path stays within `maxSlopeDeg`).
  They form a heightfield with 10 cm cells, from x = −2 to 20 m and ±4 m across. The flat ground stays
  underneath, so hills only rise from it.
- **Branches.** Straight cylinders of radius 1.2–2.5 cm and length 0.5–1.2 m, roughly across the path
  (±34°), within ±0.5 m of the centreline, resting on the hills. `branchDensity` is branches per metre.
- **Readouts.** Trunk height (input and fall check) is measured from the hills under the trunk, and foot
  contacts from the surface under each foot, branches included. On flat ground both equal the previous
  absolute readouts.
- **Determinism.** The terrain comes from its own seeded stream (`quadruped-terrain`), independent of
  friction and pushes. The colliders are part of the physics snapshot, and the terrain description
  travels with it, so planner rollouts and workers see the same ground.

### Spike protocol (fixed before any terrain measurement)

- **Seeds and pushes:** dev seeds 10001–10040; pushes on, as in training (8 N·s).
- **Network:** run 1 of the published study (`artifacts/quadruped/study/run-1`), unchanged.
- **Calibration**, on the planner (level 2), for each terrain family on its own:
  - hills: `maxSlopeDeg` ∈ {4, 8, 12, 16};
  - branches: `branchDensity` ∈ {0.3, 0.6, 1.0} per metre.
  - Rule: take the hardest level at which the planner falls on at most 20% of the 40 seeds (8/40). If none
    qualifies, take the easiest, and report it.
  - `mixed` uses both calibrated values.
  - The terrain has to stay passable for the teacher. How hard it is for the network is what we measure,
    so the network plays no part in the calibration.
- **Conditions** on flat, hills, branches and mixed:
  - the hand-written trot;
  - the planner (level 2);
  - System One alone;
  - guard only;
  - hybrid at 0.9 without the guard;
  - hybrid + guard at 0.7 and at 0.9.
- **Measures:**
  - distance and falls;
  - cost per move and escalation rate;
  - System One's mean confidence;
  - its agreement with the planner, on every 4th decision as in the study, and the AUROC of
    1 − confidence for detecting its disagreements.
- **Decision rule for retraining tonight.** Retrain on terrain if, on at least one non-flat terrain, the
  planner is viable (falls ≤ 20%) and System One alone reaches less than 90% of the planner's distance.
  - A new training, if any, is a separate change with its own targets.
- **Reported as exploratory.** One network, dev seeds, no test split.
  - The novelty question is answered descriptively: escalation rate and mean confidence on each terrain
    against flat.

## Risks / Trade-offs

- **The hand-written trot may be the bottleneck.** Its 6 cm swing height is fixed, and branches taller than
  that will trip every driver. Calibration on the planner exposes this before any network measurement.
- **Heightfield and cylinders add physics cost.** Measured in the spike, as decision time.
