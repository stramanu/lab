# Design

## Context

See proposal.md. The quadruped is a continuous game: it reuses `ContinuousEnv`, `ContinuousTeacher`, `ContinuousGuard`, the continuous ensemble, the continuous pipeline, the hybrid players, the study and the demo. What is new is a third-party physics engine that needs asynchronous initialisation, and a planner whose cost is dominated by physics steps.

## Decisions

### Physics (values from the probe, to be confirmed by the spike)
- Rapier `@dimforge/rapier3d-deterministic-compat@0.20.0`, pinned exactly. Gravity −9.81 m/s², dt = 5 ms. Solver: 4 iterations × 4 internal PGS iterations (see below).
- Robot bodies collide only with the ground (collision groups); self-collisions are disabled. Ground friction is drawn per episode from U(0.7, 1.1) with the seed (see below). Bodies never sleep. A sleeping body would change the cost of a step, and it makes speed measurements meaningless.
- Joints are revolute impulse joints with force-based position motors, configured once per decision. In the probe, the default acceleration-based motor model could not hold the legs against gravity.
- **Initialisation.** `RAPIER.init()` is asynchronous. The game definition gets an optional `init(): Promise<void>`, which the scripts, the evaluation workers, the training worker and the demo await once, before calling `makeEnv`. The synchronous `Env` contracts are unchanged.

### Robot (starting values)
- Trunk: a 0.50 × 0.12 × 0.24 m box, about 6 kg. Hips at (±0.20, 0, ±0.12) m.
- Legs: a small hip body, a thigh and a shank (capsules 0.18 m long), and a spherical foot; about 0.5 kg per leg.
- Per leg: hip abduction (axis x), hip flexion (axis z) and knee (axis z), with position targets from the controller. PD gains (starting value: stiffness 80 N·m/rad, damping 2 N·m·s/rad) are tuned in the spike, on the base controller only.

### Episode, pushes and falls
- 20 s, with decisions at 10 Hz (20 physics steps per decision), so 200 decisions per episode.
- **Pushes.** From the seeded environment stream, the first push comes at a time drawn from U(1.5, 3) s, and each next one U(1.5, 3) s later. Each is a horizontal impulse on the trunk, with a uniform direction and a magnitude drawn from U(0.5, 1)·J. J is calibrated in the spike so that the base controller falls on 20–60% of 20 dev seeds, and then fixed.
- **Fall**: trunk centre below 0.12 m, or the angle between the trunk's up axis and vertical above 60°. A fall ends the episode.
- **Score**: forward displacement of the trunk along +x, in metres, at the end or at the fall.
- Reported metrics: fall rate, distance, and mean forward speed.

### Base controller
- **Gait.** A trot at a nominal 2 Hz. Phase φ advances with the frequency; the diagonal pairs (front-left + hind-right, front-right + hind-left) are half a cycle apart. Duty factor 0.5; swing foot height 0.06 m.
- **Nominal foot trajectory.** For each leg, in the hip frame: a stance line and a swing arc around the neutral point below the hip, with step length set by the target speed (0.4 m/s).
- **Balance.** Raibert-style foot placement (Raibert 1986): the touchdown point is shifted by T_stance·v/2 + k_v·(v − v_target), in both horizontal directions. A PD correction of trunk roll and pitch adjusts the stance legs' lengths.
- **Inverse kinematics.** Analytical, per leg (abduction, then a planar two-link solution).
- The controller is stateless given the environment state: φ and the last action are part of the state.

### Action (4-D, each component in [−1, 1])
| Component | Mapping |
| --- | --- |
| a₀ forward placement offset | ±0.08 m added to the Raibert touchdown point along x |
| a₁ lateral placement offset | ±0.06 m along z |
| a₂ body height offset | ±0.04 m |
| a₃ step frequency offset | ±0.5 Hz |

a = 0 is the base controller. This is the "policies modulating trajectory generators" architecture (Iscen et al. 2018), with the gait generator as the trajectory generator.

### Observation (46 values)
- trunk height (1);
- gravity direction in the trunk frame (3);
- heading as (sin yaw, cos yaw) (2);
- trunk linear velocity (3) and angular velocity (3) in the trunk frame;
- 12 joint angles and 12 joint velocities;
- 4 foot-contact flags;
- gait phase as (sin φ, cos φ) (2);
- the last action (4).

This is the proprioceptive set common in learned quadruped locomotion (Hwangbo et al. 2019; Lee et al. 2020). Pushes are not observed directly, only through their effect on velocities.

### Teacher: rollout over the base controller
- **Candidate set** (fixed, deterministic, 21 candidates):
  - a = 0;
  - ±0.5 and ±1 along each of the 4 axes (16);
  - (±1, ±1) in the foot-placement plane (a₀, a₁) with a₂ = a₃ = 0 (4).
- **Rollout.** From a snapshot of the current state, apply the candidate for one decision, then a = 0 until the horizon H. Hold 1 keeps the rollout algorithm's guarantee of doing no worse than the base policy, the lesson from the lander. Rollouts contain no pushes; the planner does not see the future.
- **Candidate score** = forward progress over H − 100 if a fall occurs within H, + 0.02 for a = 0 as a tie-break toward the base controller.
- **Satisficing.** If a = 0 is within 0.01 m of the best score, a = 0 is chosen. The margin is fixed in the spike before the imitation criteria are measured.
- **Knob**: H ∈ {0.5, 1, 2} s (levels 1/2/3); reference level 2.
- **Cost** = physics steps simulated, for example 21 × 200 = 4,200 at level 2. Restores are counted as 0 steps; at 0.09 ms each they are 2% of the time.
- `targetAction` for the continuous pipeline is the chosen candidate.

### Guard
Simulate the proposed action for 0.2 s (hold 1, then a = 0), from a snapshot and without pushes. Reject if a fall occurs, or if the tilt exceeds 45°. Cost: 40 physics steps, about 1% of the level-2 planner.

### System One and agreement
- The existing ensemble: 5 × (46 → 64 → 64 → 4), MSE on the planner's action.
- Declared agreement rule: every component within 0.25, half the candidate grid's spacing.
- Confidence: the existing disagreement-based monotone map.

### Parallel evaluation
- `runConditions` gains a `workers` option. Seeds are split into contiguous chunks; each worker thread builds its own environments (awaiting `init`), runs its chunk and returns per-seed records. The records are merged in seed order before aggregation, so the numbers are identical to the sequential run. A test verifies this on Snake and on the quadruped.
- Default: the number of cores minus 2. The study records the worker count in its JSON.

### Feasibility spike (`experiments/quadruped-feasibility.ts`, dev seeds only)
- **Order.**
  1. Check criterion 1.
  2. Tune PD gains and the base controller without pushes, and check criterion 2.
  3. Calibrate J with the base controller only.
  4. Check criteria 3–4.
  5. Build the imitation dataset (planner-driven episodes, with DAgger rounds as in the racing spike), and check criteria 5–6.
- Thresholds as in the proposal. Any tuning made during the spike is logged in EXPERIMENTS.md with its evidence.

### Demo
- `web/quadruped-view.ts` renders the robot with three.js from the environment's body poses:
  - the trunk coloured by who decided the last action;
  - legs and feet with their contacts;
  - a grid floor with distance marks, and push arrows that fade out;
  - a camera following at a fixed offset.
- Rapier loads only when the quadruped tab is selected.
- The continuous gauges show the 4 action components.

## Changes made while building the base controller (before any spike measurement)

Development used dev seeds 10001–10006 and the base controller only, without pushes; the planner was not
measured before the spike. Every change below is logged in EXPERIMENTS.md with its evidence.

- **Solver.** With Rapier's default constraint solver (4 iterations, 1 internal PGS iteration) the standing
  robot sags 4.8 cm and tilts 7.5°; with 4 internal PGS iterations it stands within 5 mm and 0.4°
  (`pnpm exp quadruped-solver`). Adopted: 4 × 4. Motor gains: stiffness 300 N·m/rad, damping 8.
- **Seeded ground friction.** Without pushes every seed played the same episode, so criterion 2 would
  have been one episode repeated 20 times. Each episode now draws the ground friction from U(0.7, 1.1): a
  small domain randomisation, as in sim-to-real locomotion (Tan et al., RSS 2018).
- **Levelling.** Each foot target is taken relative to its own hip in the gravity-aligned frame, so every
  hip is held at the nominal height above its foot. The first version referenced the targets to the trunk
  centre, which is neutral to tilt and let the trunk drift to 25–50°.
- **Stance.** Stance feet are swept backwards relative to their hips at the commanded speed, and Raibert
  placement sets where swing feet land. A variant with feet held where they landed (Raibert's hopper
  scheme) is unstable with position-controlled legs: holding the hip at a fixed height above a planted
  foot lengthens the leg as the body moves away, which pushes the body further (it drifted even while
  standing). The PD correction of roll and pitch listed above is replaced by the levelling.
- **Heading.** Shifting touchdown points does not change stride length and did not correct heading. The
  heading is controlled by a stance-sweep speed difference between the left and right sides,
  proportional to yaw (gain 1 m/s per rad).
- **Gait.** 3 Hz trot at a commanded 0.4 m/s, swing height 0.06 m, velocity gain 0.05 s. On dev seeds
  10001–10005: no falls in 20 s, 0.35 m/s mean (including the standing and ramp time), tilt below 4°,
  heading within 5°.
- **Observation, action and candidates** are unchanged.

### Push calibration rule (fixed before running the spike)
J is the first value of 4, 5, 6, 7, 8, 9, 10, 12 N·s for which the base controller falls on 20–60% of
20 dev seeds (10001–10020). If none qualifies, the spike stops and reports.

## Revision after spike v1 (declared before spike v2)

Spike v1 (EXPERIMENTS.md, decision 27) passed criteria 1, 2 and 4 and failed 3, 5 and 6: the planner fell
as often as the base controller (4/20) while covering ×1.79 the distance, agreement was 31% and AUROC
0.61. The author chose a declared revision with a second spike on the same dev seeds and the same six
criteria. Two changes to the planner, each fixed by a rule before any v2 measurement:

1. **Stability term.** Candidate score = progress − k · (maximum trunk tilt during the rollout, rad) − the
   fall penalty. A posture term is standard in MPC costs for legged robots. Rule for k: reaching the fall
   limit (60°) costs as much as one second of base-controller walking (0.4 m), so k = 0.4 / (π/3) ≈
   0.38 m/rad.
2. **Satisficing margin** = the base gait's own variability: the standard deviation of the base
   controller's progress over 1 s windows, without pushes, on dev seeds 10001–10020 after the ramp
   (`pnpm exp quadruped-margin`): 5.7 mm. It is smaller than v1's 1 cm, so this change does not make the
   labels less ambiguous. The differences between candidates are real, not noise, and the stability term
   is the substantive change.

Everything else is unchanged, including J, which comes from the base controller alone. If v2 fails any
criterion, the experiment stops and is reported as a negative result.

## Study after the exploratory follow-up (fixed before running it)

Spike v2 stopped the experiment (decision 29). An exploratory follow-up on dev seeds (decision 30) found that
a 5 × 256×256 ensemble trained on about 98k states drives almost as well as the planner. The author chose
to run the standard 5-run test study, as for every other game. Its failed spike stays reported as such.
Fixed now, before any study measurement:

- **Hypotheses and targets**: H1–H4 unchanged from every other game. H1: escalation below 10% (mean of the
  last 3 iterations). H2: a hybrid at ≥ 90% of the planner's score for ≥ 10× less cost. H3: System One
  alone ≥ 60% of the planner. H4: ≥ 95% agreement above threshold 0.9.
- **Split**: test seeds 1–200, 5 training runs (seeds 1–5), J = 8 N·s, planner levels 1/2/3, reference 2.
- **System One**: an ensemble of 5 × 256×256 (the exploratory follow-up's larger size).
- **Pipeline** (the standard continuous pipeline with the quadruped's values):
  - 400 bootstrap episodes, 6 bootstrap epochs;
  - 5 escalation iterations of at most 4,000 moves, retraining every 2,000 new examples for 2 epochs;
  - threshold 0.9, audit rate 2%, 5 consolidation epochs, dataset capacity 100,000.

  The default 30 iterations of up to 50,000 moves would take days at 0.18 s per planner label.
- **Parallel bootstrap**: bootstrap episodes are planner-driven, so they do not depend on the network.
  They are generated on worker threads and replayed into the pipeline in episode order. A test checks
  that the result is identical to the sequential pipeline.
- **Evaluation**: agreement and calibration of System One moves are measured on every 4th decision (the
  other games label every decision). The subsample is unbiased and cuts the evaluation cost by 4. Scores,
  costs and escalation shares use every decision.

## Risks / Trade-offs

- [The hand-written trot may not walk robustly in Rapier. The probe's open-loop trot tipped over] → criterion 2, tuning on dev seeds before any planner measurement, and feedback from foot placement and attitude.
- [Pushes too weak make the planner useless, as the lander taught; pushes too strong make every controller fall] → J is calibrated so the base controller falls on 20–60% of seeds, and criterion 3 requires the planner to be clearly better.
- [Planner cost makes training and studies slow (about 0.12 s per decision)] → parallel evaluation; criterion 4 bounds the per-decision time.
- [Determinism across machines is not guaranteed by our checks] → the deterministic build is designed for cross-platform determinism, but we verify only repeatability on the reference machine. The README says so.
- [A 1.1 MB gzipped WASM bundle] → loaded lazily, only for this tab.
