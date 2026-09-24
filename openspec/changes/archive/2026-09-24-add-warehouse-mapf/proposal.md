# Proposal

## Why

Step 5 of the roadmap asks for an experiment close to robotics and a real problem. Warehouse fleets of mobile robots that carry shelves to stations (Wurman, D'Andrea & Mountz, AI Magazine 2008) have to solve **lifelong multi-agent path finding** (MAPF) in real time (Li et al., AAAI 2021). Their centralised planners get expensive fast as the fleet grows (Stern et al., SoCS 2019; Sharon et al., AIJ 2015). Learned decentralised policies imitate those planners from local observations (PRIMAL: Sartoretti et al., IEEE RA-L 2019; DHC: Ma, Luo & Ma, ICRA 2021).

Our three games showed when the System One / System Two pattern pays off: **discrete, decisive choices with real consequences**, an expensive planner, and a cheap safety check (Snake). Warehouse MAPF has all of these:
- actions are wait or move to one of four cells;
- mistakes cause collisions, deadlocks and congestion;
- planning cost grows with the fleet;
- a collision check is a natural, near-free guard.

## What Changes

- **Warehouse environment.** A lifelong MAPF warehouse, headless and deterministic given the seed:
  - a grid with shelf blocks and aisles, and a fleet of robots; each robot gets a new goal when it reaches its current one;
  - one decision per robot per timestep, taken in a rotating order, so it fits the existing single-decision `Env` contract;
  - actions: wait, north, east, south, west;
  - a move into an occupied or claimed cell, or a swap, is blocked and counted as a collision;
  - score = deliveries in the time limit; collisions and wait time are reported.
- **Egocentric observation.** A 9×9 field of view (shelves, robots, own goal), the goal direction, and the change in distance-to-goal for each neighbouring cell from the robot's precomputed distance map (heuristic channels as in DHC).
- **Greedy baseline.** Each robot steps to the free neighbour that most reduces its distance to goal, otherwise it waits. It is the hand-written baseline the lander taught us to always report.
- **System Two.** Cooperative space-time search after Silver (AIIDE 2005), in a stateless form. Each candidate action is scored by a windowed space-time search against the other robots' predicted trajectories. Cost is counted in nodes expanded; the window length is the cost knob.
- **Guard.** It rejects an action that would collide with a claimed cell (vertex or swap conflict), and moves that enter a dead-end pocket another robot is heading out of. It costs O(1).
- **Feasibility spike.** Criteria fixed here, before any measurement, on dev seeds:
  1. the planner is collision-free and delivers ≥ 20% more than the greedy baseline;
  2. exact ties < 20% of the planner's decisions after deterministic tie-breaking;
  3. a 64×64 network imitating the planner reaches ≥ 85% agreement on dev states;
  4. **error detection**: 1 − confidence separates disagreeing from agreeing states with AUROC ≥ 0.75. This is the property racing lacked.

  If any fails, the change stops and reports, as before.
- **If it passes.** Registry entry, the 5-run test study, dev experiments, the demo view (fleet coloured by who decided each robot's move, shelves, stations), README and EXPERIMENTS.md.

Out of scope: optimal CBS as the planner (used only as a reference in the discussion), heterogeneous robots, communication between robots.

## Capabilities

### New Capabilities
- `warehouse-env`: warehouse layout, fleet, lifelong goals, decision order, conflicts, observation and metrics.
- `warehouse-teacher`: the WHCA*-based planner scoring each robot's actions, with its cost and reference quality.
- `warehouse-guard`: the collision and dead-end check on a robot's proposed action.

### Modified Capabilities
<!-- None: reuses the existing contracts, pipeline, evaluation, studies and demo. -->

## Impact

- New `src/games/warehouse/`, a registry entry, `experiments/warehouse-feasibility.ts`; then the study, the demo view, the README and the redeploy.
