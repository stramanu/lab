# Proposal

## Why

The last experiment moves the question into 3D rigid-body physics: a four-legged robot that must keep walking while it is pushed. Legged locomotion is a standard testbed for exactly this project's pattern.
- Model-based controllers plan through a model of the robot, at a cost: convex MPC on MIT Cheetah 3 (Di Carlo et al., IROS 2018), and sampling-based MPC through a physics simulator (Howell et al., "Predictive Sampling", 2022; Tassa, Erez & Todorov, IROS 2012).
- Learned policies are trained to reproduce such an expert cheaply: MPC-Net distils an MPC into a network for the ANYmal quadruped (Carius, Farshidian & Hutter, IEEE RA-L 2020), and teacher–student training distils a privileged teacher into a deployable student (Lee et al., Science Robotics 2020).

Can a tiny System One keep the robot upright at a fraction of the planner's cost, and hand control back when a push makes it unsure?

## What Changes

- **Physics.** Rapier (dimforge; Apache-2.0), pinned to the deterministic WebAssembly build `@dimforge/rapier3d-deterministic-compat@0.20.0`. It is the first runtime dependency outside rendering, and it is not an ML library. A probe on the reference machine measured:
  - bitwise-identical repeated runs, and bitwise-identical continuation after a snapshot restore;
  - a snapshot taken in 0.01 ms and restored in 0.09 ms (about 22 KB);
  - about 35,000 physics steps per second on one core, for a 13-body quadruped with contacts at dt = 5 ms.
- **Quadruped environment.** A 12-joint quadruped (hip abduction, hip flexion and knee per leg) about 0.5 m long, with position-controlled joints (PD motors at the physics rate). It walks forward on flat ground for 20 s while seeded horizontal pushes hit its trunk every few seconds.
  - Decisions at 10 Hz.
  - Score = forward distance in metres. A fall (trunk too low or too tilted) ends the episode.
- **Base controller (hand-written, reported as a baseline).**
  - A trot gait generator: a phase oscillator with diagonal leg pairs in antiphase, a simple central-pattern-generator scheme (Ijspeert, Neural Networks 2008).
  - Per-leg inverse kinematics.
  - Raibert-style foot placement for balance (Raibert, *Legged Robots That Balance*, 1986).
- **Action space.** A 4-dimensional continuous modulation of the base controller: forward foot-placement offset, lateral foot-placement offset, body height offset and step frequency offset. A policy that modulates a trajectory generator follows Iscen et al. (CoRL 2018). Action 0 is the base controller.
- **System Two.** A rollout algorithm (Bertsekas et al. 1997) over the base controller. It simulates a fixed set of candidate modulations, each applied for one decision and then followed by the base controller, through Rapier from a snapshot of the current state, and picks the one with the most progress without a fall. It does not see future pushes. Cost = physics steps simulated; the horizon is the cost knob.
- **System One.** The existing continuous deep ensemble (Lakshminarayanan et al. 2017), regressing the planner's 4-D action from a 46-value proprioceptive observation.
- **Guard.** It simulates System One's proposed action for 0.2 s and rejects it if the robot would fall or tilt beyond a limit. Its cost is about 1% of the planner's.
- **Parallel evaluation.** Evaluation over seeds runs in a pool of worker threads, with results identical to the sequential run. The study would otherwise take many hours.
- **Feasibility spike.** Criteria fixed here, before any measurement, on dev seeds:
  1. determinism: an episode run twice, and a restored snapshot continued, are bitwise identical;
  2. the base controller walks 20 s without pushes on 20/20 dev seeds, at a mean forward speed ≥ 0.3 m/s;
  3. with pushes, the planner (level 2) falls on at most half as many dev seeds as the base controller and covers ≥ 20% more distance. The push strength is calibrated first, with the base controller only, so that it falls on 20–60% of dev seeds;
  4. the planner's level-2 decision takes ≤ 0.25 s on one core of the reference machine;
  5. the ensemble reaches ≥ 85% agreement (declared rule: every action component within 0.25) on planner-visited dev states;
  6. error detection: the ensemble's disagreement separates disagreeing from agreeing states with AUROC ≥ 0.75.

  If any fails, the change stops and reports, as before.
- **If it passes.** Registry entry, the 5-run test study, a 3D view in the demo (the robot coloured by who decided, push arrows, a following camera), README and EXPERIMENTS.md.

Out of scope: rough terrain, stairs, turning commands, vision, and sim-to-real claims.

## Capabilities

### New Capabilities
- `quadruped-env`: the physics world, robot, pushes, decisions, observation, falls, score and determinism.
- `quadruped-teacher`: the base controller and the rollout planner over its modulations, with cost.
- `quadruped-guard`: the short-rollout fall check on a proposed action.

### Modified Capabilities
- `evaluation-harness`: evaluation over seeds can run in parallel worker threads, with identical results.

## Impact

- New `src/games/quadruped/`, a registry entry with a one-time asynchronous physics initialisation, `experiments/quadruped-feasibility.ts`, and a worker-thread pool in `src/eval/`.
- New dependency `@dimforge/rapier3d-deterministic-compat` (about 1.1 MB gzipped), loaded in the browser only when the quadruped is opened.
- After the spike: the study, `web/quadruped-view.ts` (three.js), README, EXPERIMENTS.md and the redeploy.
