# Design

## Context

See proposal.md. The quadruped is a continuous game: it reuses `ContinuousEnv`, `ContinuousTeacher`, `ContinuousGuard`, the continuous ensemble, the continuous pipeline, the hybrid players, the study and the demo. What is new is a third-party physics engine that needs asynchronous initialisation, and a planner whose cost is dominated by physics steps.

## Decisions

### Physics (values from the probe, to be confirmed by the spike)
- Rapier `@dimforge/rapier3d-deterministic-compat@0.20.0`, pinned exactly. Gravity −9.81 m/s², dt = 5 ms.
- Robot bodies collide only with the ground (collision groups); self-collisions are disabled. Ground friction 1.0. Bodies never sleep. A sleeping body would change the cost of a step, and it makes speed measurements meaningless.
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

## Risks / Trade-offs

- [The hand-written trot may not walk robustly in Rapier. The probe's open-loop trot tipped over] → criterion 2, tuning on dev seeds before any planner measurement, and feedback from foot placement and attitude.
- [Pushes too weak make the planner useless, as the lander taught; pushes too strong make every controller fall] → J is calibrated so the base controller falls on 20–60% of seeds, and criterion 3 requires the planner to be clearly better.
- [Planner cost makes training and studies slow (about 0.12 s per decision)] → parallel evaluation; criterion 4 bounds the per-decision time.
- [Determinism across machines is not guaranteed by our checks] → the deterministic build is designed for cross-platform determinism, but we verify only repeatability on the reference machine. The README says so.
- [A 1.1 MB gzipped WASM bundle] → loaded lazily, only for this tab.
