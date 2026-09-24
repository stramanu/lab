# Design

## Context

The contracts (`Env`, `Teacher`, `Guard`), the registry, the pipeline, the studies and the demo adapters are game-agnostic. The lander showed what goes wrong when a base controller is bang-bang and actions are often equivalent (EXPERIMENTS.md, entries 9–10). That is why this design adds a feasibility spike with fixed criteria (see proposal.md) before training.

## Decisions

### Track
Centreline radius `r(θ) = R₀ · (1 + Σₖ aₖ sin(kθ + φₖ))` for k = 2..5, with seeded amplitudes (bounded so the curvature stays drivable and the loop does not self-intersect). It is sampled every metre into a polyline with cumulative arc length, tangents and signed curvature. Width 10 m, R₀ ≈ 70 m, so a lap is about 400–500 m. The car starts on the centreline at a seeded arc position, facing the direction of travel. Progress is the forward arc length travelled, unwrapped across laps.
Nearest-centreline lookup uses the previous index plus a local window (O(1) per step), which keeps rollouts cheap.

### Car (kinematic bicycle with a friction cap)
Following the kinematic bicycle model used for autonomous-driving control design (Kong et al., IEEE IV 2015; Rajamani, *Vehicle Dynamics and Control*, 2012):
- The state is x, y, heading ψ, speed v and steering δ.
- Yaw rate `ψ̇ = v · tan δ / L`, with wheelbase L = 2.6 m. Steering moves toward the commanded level at a finite rate (2.5 rad/s), so the car cannot flip instantly.
- **Friction cap.** Lateral acceleration `a_lat = v · ψ̇` is capped at μg, with μ = 1.1. Above the cap the yaw rate is scaled down (the car understeers and slides wide) and an extra speed loss proportional to the excess is applied.
- Longitudinal: gas +6 m/s² (fading linearly to 0 at 45 m/s), brake −10 m/s², drag −0.002·v² − 0.2. *(The first draft used 0.02·v², which capped the top speed at ~14 m/s: corners never mattered, and planner and controller scored the same 820 m. Corrected before the spike.)*
- Integration: semi-implicit Euler at 50 Hz, 5 steps per decision (10 Hz). Time limit 60 s (600 decisions).

### Actions (revised after the first spike)
First design: steering levels {−0.30, −0.12, 0, +0.12, +0.30} rad × pedal {gas, brake} = 10 actions. The spike failed criterion 4, with 80.7% agreement (82.2% after the declared τ revision). Diagnosis on dev states: 16.4 of the 17.8 points of disagreement were between **adjacent steering levels**, while the pedal was almost perfect. A quantized pure-pursuit controller alternates two levels to hold a curvature between them, which is the lander's equivalence problem at a smaller scale.

Revised design: **incremental steering commands** {left, hold, right} × pedal = 6 actions. A command moves the steering target by 0.06 rad (clamped to ±0.30 rad); the servo follows at 2.5 rad/s. Holding a corner means choosing "hold" repeatedly. The encoding carries the commanded steering, so the network knows where the wheel is. The spike criteria and thresholds are unchanged and the spike is re-run in full.

### Base controller
- **Pure-pursuit steering** (Coulter, CMU-RI-TR-92-01, 1992) with a speed-dependent lookahead (6 + 0.35·v m), turned into commands: steer toward the pure-pursuit angle, and hold when within half a step.
- **Speed.** Target speed from the maximum curvature over the next ~(v²/2b + 10) m: `v* = 0.85 · √(μg / κ)`. Gas below target, brake above.
- It is deliberately conservative (the 0.85 margin), so criterion 2 can show whether planning adds real progress.

### Teacher: rollout algorithm (Bertsekas et al., 1997)
- For each first action, every continuation of `depth − 1` further one-decision actions, then the base controller for H decisions, **once for each speed margin in {0.85, 0.95, 1.05, 1.15, 1.25}** (0.85 is the base controller's own margin, so the planner cannot do worse than the controller within the horizon).
- Why the margins: with rollouts that only use the conservative controller, the planner can deviate for a single decision and cannot see the value of carrying more speed. On 20 ad-hoc seeds (20000–20019) it gained only +0.5% over the controller. With margins {0.85, 0.95, 1.05}: +8.8%. With the five margins above: +11.2%. These iterations happened before the spike and are logged in EXPERIMENTS.md; the spike thresholds were not touched.
- **Branch value**: progress at the horizon, plus 0.5 m per m/s of final speed (so a branch is not rewarded for ending slow), plus 0 if on track or −1000 − 10·(remaining horizon) if it went off track.
- **Satisficing and root preference**: outcomes within 0.5 m of the best count as equal; ties are then broken by the base controller's action (+0.3), gas over brake (+0.1) and holding the steering (+0.02).
- **τ rule**: τ = smallest preference step / 3 = 0.0067, the rule implied by Snake (0.3/3) and the lander (0.1/3). It was declared after the first spike, which had used τ = 0.05 without the planned gap analysis.
- **Knob.** The rollout horizon: level L → H = 20·L decisions (2 / 4 / 8 s), with depth 1. Level 2 is the default (≈ 10 actions × 5 margins × 40 decisions × 5 steps ≈ 10,000 physics steps, ~1.3 ms per decision). A depth-2 tree would cost ~100,000 steps per decision, too slow for the studies.

### Guard
One decision of the proposed action, then the base controller for 10 decisions; reject if off track. Cost ≈ 55 steps.

### Encoding (20 values)
Speed / 40, sin and cos of the heading error, lateral offset / half-width, commanded steering / 0.3, then for 7 look-ahead distances (5, 10, 20, 30, 45, 60, 80 m) the track's lateral position in the car frame / 20 and 5 curvature samples scaled by 20. Everything is egocentric.

### Feasibility spike
`experiments/racing-feasibility.ts` (dev seeds for evaluation, training seeds for data) measures criteria 1–4 and writes `artifacts/experiments/racing-feasibility.json` with a pass/fail per criterion. The criteria and their thresholds are the ones in proposal.md and are not changed after the measurement. If any fails, implementation pauses (tasks 3+) and the user is consulted.

### Demo view
- Track drawn as a filled band, with kerbs as dashed edges; the car as a small oriented body.
- The recent trajectory is coloured by who decided each move.
- A faint preview of the base controller's racing line ahead.
- The camera follows the car at a fixed zoom, with a minimap in the corner.
- Network layout: a labeled list, like the lander's.

## Risks / Trade-offs

- [Criterion 4 fails: steering chatter again] → pause; candidates: a lower decision rate (5 Hz), steering as a rate command, or a continuous-output student (out of scope here).
- [The planner finds little over the base controller (criterion 2)] → reduce the base controller's margin, or accept the game as not needing planning and stop.
- [Rollout cost at depth 2 (~15k steps) makes training slow] → measured in the spike; the horizon can shrink.
