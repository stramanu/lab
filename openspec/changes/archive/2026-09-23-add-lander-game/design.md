# Design

## Context

The generic parts already exist and are game-agnostic: the `Env` / `Teacher` / `Guard` contracts, the MLP, the hybrid, the three-phase pipeline (`GameSpec`) and the evaluation runner and hypotheses. Snake plugged into them through `src/games/snake/` plus two CLI scripts. The lander does the same. See proposal.md for motivation.

What we learned on Snake and apply here:
- measure the planner first (quality, cost per knob level) before training;
- check the gaps between the teacher's top two scores before choosing τ, because near-ties produce flat soft labels that cap confidence;
- expect confident mistakes on critical states, and give the guard the job of catching them.

## Goals / Non-Goals

**Goals:**
- A lander whose planner lands ≥ 90% of evaluation seeds, trained and evaluated with the existing pipeline and harness, unchanged.
- Results for H1–H4 reported next to Snake's, with the same targets.

**Non-Goals:**
- Realistic rigid-body collision (the ship touches the ground at one foot point).
- Browser demo integration, H5.

## Decisions

### World and physics (starting values, tunable without spec changes)
- World 100 m wide, 70 m tall. Gravity 1.62 m/s² downward. Fixed step dt = 1/60 s, semi-implicit Euler. Each decision is held for 6 steps (0.1 s, 10 decisions per second). Time limit 40 s (400 decisions).
- Main engine: 4.0 m/s² along the ship's up axis. Side thrusters: ±3 rad/s² angular acceleration, no angular damping.
- Fuel is measured in seconds of burn: 12 s in the tank. The main engine burns 1 per second, the side thrusters 0.25 per second.
- Wind: horizontal acceleration `w0 + 0.15·sin(2πt/6 + φ)`, with `w0 ∈ [−0.3, 0.3]` m/s² and `φ` drawn from the seed. It is a deterministic function of time, so the planner's simulation matches reality.
- Terrain: 21 control points with heights in [2, 15] m, linearly interpolated, and a flat pad 12 m wide at a seeded x, whose control points are flattened.
- Start: x in [10, 90], y in [55, 65], vx in [−3, 3], vy in [−1, 0], angle in ±0.2 rad, all seeded.
- Ground contact: the foot point (x, y) at or below terrain(x). A landing requires the foot on the pad, |vy| ≤ 2.0 m/s, |vx| ≤ 1.0 m/s and |angle| ≤ 0.25 rad.
- PRNG streams: `lander-world` for the world, and the teacher's own stream seeded by a hash of the state.

### Encoding (16 values)
`dx/50, height above pad/70, vx/10, vy/10, sin θ, cos θ, ω/3, fuel fraction, wind/0.5`, then the terrain height relative to the ship at x−8, x−4, x, x+4, x+8 (divided by 70), then `onPad` (0/1) and height above the ground / 70. Everything is egocentric, relative to the pad or to the ship, so that it generalizes across seeds.

### Teacher: rollout algorithm (changed during tuning)
The first design was random-shooting MPC: N random piecewise-constant sequences over a 2 s horizon, with a shaped glide-path cost. The benchmark on 50 non-evaluation seeds (5000–5049) rejected it: **0% landings at every knob level**, the same as random. Random rotation chunks never produce controlled flight, and 2 s is too short to see the crash coming. Adding a hand-written autopilot as base policy after a random perturbation gave 62–78%, still worse than the autopilot alone (94%). That is expected: a perturbed sequence found once is not reproduced at the next re-plan, and the shaped in-flight cost disagrees with the real objective.

The final teacher is Bertsekas' **rollout algorithm**, i.e. receding-horizon MPC with a base policy:
- For each first action a, enumerate every sequence of `depth − 1` further one-decision actions, then let the autopilot fly to the end of the episode (up to 400 decisions). Score a branch by its true outcome: landing → −(100 + 50·fuel fraction), the negated game score; crash or out of bounds → 1000 + impact speed + speed; unfinished → 500. An action's score is the negated best cost of its branches.
- It is deterministic (no sampling). Because actions are held for one decision, the next decision's tree always contains the continuation of the current best branch, so the planner cannot do worse than the autopilot. With 3-decision holds it lost that property and dropped to 74% (depth 2) and 38% (depth 3).
- Knob: tree depth 1 / 2 / 3 → 4 / 16 / 64 rollouts ≈ 3,000 / 11,700 / 44,800 physics steps per decision (58 / 225 / 867 µs on an M4 Max). Default depth 2.

Measured on seeds 5000–5049: depth 1, 2 and 3 all land **100%**, using 7.27 / 6.91 / 6.82 s of fuel; the autopilot alone lands 94%, random 0%.

### Autopilot (base policy)
A PD controller: tilt toward the pad to reach a horizontal speed target (compensating the wind); hold a descent rate that shrinks with the height above both the pad and the ground; hold altitude while away from the pad and low; settle horizontally and touch down at 0.8 m/s over the pad. It is part of System Two's machinery (rollouts and guard), not a player in the experiment. The evaluation reports it as an extra baseline, so readers can see what a hand-written controller achieves.

Physics retuning: the tank went from 12 s to 20 s of main-engine burn. With 12 s, most autopilot failures were fuel exhaustion around t ≈ 28 s.

### Guard
Simulate the proposed action for one decision, then the autopilot as the recovery policy for 10 decisions. Reject on crash or out of bounds. Cost ≈ 66 physics steps, about 1/170 of the default teacher.

### Ties and τ (task 3.3)
On 20 non-evaluation seeds (2,960 teacher decisions), 14.9% of decisions were exact ties and 57% had a top-2 gap below 0.5 points. Often several actions reach the same landing and differ only by a few hundredths of a second of fuel. As on Snake, the teacher adds a root-only preference (none +0.3, main +0.2, left +0.1, right 0), which removes exact ties (0.0%). Then 10.5% of gaps are below 0.1 and 31% below 0.25 (one decision of main engine ≈ 0.25 points). With **τ = 0.03**: a 0.1 gap gives a 0.96 label, a 0.05 gap 0.84, and real differences become one-hot. Landing quality is unchanged (100% at depth 2).

### Imitation findings (tasks 4.1–4.2) and final teacher
The first training run (τ = 0.03, fixed preference only) reached only **~70% agreement** between student and teacher, with **85–90% escalation**. Diagnosis, all measured on non-evaluation seeds:
- Not capacity: a 256×256 network trained for 40 epochs reaches 73% validation agreement (64×64: 72%).
- Not missing inputs: adding mean wind, wind trend, the highest obstacle toward the pad and elapsed time (20 values) gives 71%.
- Not the teacher alone: even the autopilot, imitated directly, reaches only 75% (64×64) / 80% (256×256). The autopilot is a bang-bang controller at 10 Hz (42% none, 42% main, action changes on 63% of decisions). It modulates thrust like PWM, so "none" and "main" are often equivalent and only the phase differs. No network can predict that choice confidently.

Changes kept in the teacher: a **satisficing margin** (outcomes within 1 point of the best count as the best), a **preference for the autopilot's own action** (+0.5) among equivalent actions, then the fixed order. They make the labels canonical but do not raise agreement (68–70%).

Tried and not adopted: an **acceptability head** (4 sigmoid outputs trained to predict "within δ of the best", confidence = acceptability of the chosen action), prototyped outside the codebase. On 30 seeds, System One alone rose from 3/30 to 24/30 landings (δ = 1.5), but no δ gave a cheap hybrid: the best guarded hybrid landed 27–28/30 at 63–96% escalation. The likely root cause is that the teacher's labels assume the *autopilot* flies after the action, while in the hybrid the *student* does, so accepted small deviations compound. The principled fix is proper expert iteration, with rollouts using the current student as the base policy. That is recorded as future work, and the user chose to close the lander with the current results.

### Game registry (added during implementation)
The user plans to add more games, so the per-game wiring lives in `src/games/registry.ts`: env factory, teacher by knob level, knob levels and reference level, guard, pipeline overrides (τ, bootstrap episodes), and extra baselines (the lander autopilot). The CLI becomes generic: `scripts/train.ts --game <name>` and `scripts/eval.ts --game <name>`, with `train:snake` / `eval:snake` / `train:lander` / `eval:lander` as package aliases. Snake's behavior and defaults are unchanged. The registry is browser-safe, so the demo can reuse it for a game selector later.

### Training defaults
Same pipeline with a lander `GameSpec`. Bootstrap K = 100 episodes (episodes are short, ~150 decisions). τ = 0.03 (see above). Everything else stays at the pipeline defaults (threshold 0.9, 2% audit, 30 iterations, guard on).

## Risks / Trade-offs

- [The autopilot already lands 94%, so the planner adds a little safety and fuel efficiency rather than skill from nothing] → declared in the results. As with Snake, the game is a testbed for distilling an expensive planner, and a hand-written baseline is reported.
- [Planner cost at depth 2 ≈ 0.23 ms per decision] → about 40k decisions of training ≈ 10 s of planner time.
- [Continuous states rarely deduplicate] → capacity 100k is ample for this state count.
- [Flat soft labels when several actions reach similar outcomes] → τ chosen from the measured gap distribution (task 3.3).
