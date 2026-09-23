# Proposal

## Why

The user wants a third, dynamic and visually striking game, and a step toward real-world problems. Top-down racing on a procedural track meets both. Distilling a model-predictive controller into a neural driving policy with DAgger is established for autonomous driving (Pan et al., RSS 2018), and planning pays off because lap progress depends on braking points and racing lines. The lander taught us that a game can defeat the method through action equivalence: bang-bang control makes confident imitation impossible. So this change starts with a **feasibility spike whose go/no-go criteria are fixed before any measurement**. The network is trained and evaluated only if the game passes them.

## What Changes

- **Racing environment.** A headless 2D racing environment, deterministic given the seed:
  - a closed procedural track per seed (smooth radial-noise loop with fixed width);
  - car physics: a kinematic bicycle model with a friction limit on lateral acceleration, so over-driving a corner makes the car slide wide;
  - discrete actions: incremental steering command × pedal (revised after the first spike, see design);
  - 10 decisions per second, a 60 s episode, and the episode ends when the car leaves the track;
  - score = metres of track progress.
- **Base controller.** A hand-written pure-pursuit steering with a curvature-limited speed profile. It is the planner's base policy, the guard's recovery policy, and a reported baseline.
- **System Two.** A deterministic rollout planner (tree lookahead over one-decision actions, then the base controller for a fixed horizon). Its cost is counted in simulated physics steps.
- **Guard.** A short rollout of the proposed action followed by the base controller; it rejects actions that leave the track.
- **Feasibility spike** (dev and ad-hoc seeds only), with criteria fixed here:
  1. the planner stays on track in ≥ 90% of episodes;
  2. the planner covers ≥ 10% more distance than the base controller, so planning matters;
  3. exact ties are below 20% of the planner's decisions after deterministic tie-breaking;
  4. a 64×64 network imitating the planner reaches ≥ 85% agreement on dev episodes.

  If a criterion fails, the implementation stops, the result is reported, and a design revision is proposed (for example a finer action set or a lower decision rate).
- If the spike passes: registration in the game registry, the 5-run test study and the dev experiments, the demo view (track, car, racing line, decider-colored trail) with a network layout, the README results and EXPERIMENTS.md entries.

Out of scope: opponents and multi-car racing, realistic tire models, the robotics experiment (step 5).

## Capabilities

### New Capabilities
- `racing-env`: track generation, car physics, actions, determinism, encoding and metrics of the racing game.
- `racing-teacher`: the rollout planner for racing, its cost units and reference quality.
- `racing-guard`: the racing guard's safety check on a proposed action.

### Modified Capabilities
<!-- None: the registry, pipeline, evaluation, studies and demo are reused through their existing contracts. -->

## Impact

- New `src/games/racing/`, a registry entry, `web/racing-view.ts`, and a `web/games.ts` entry.
- New `experiments/racing-feasibility.ts`, which produces the go/no-go evidence.
- Study and experiment outputs, README, EXPERIMENTS.md, demo data and a redeploy.
