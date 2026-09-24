# Design

## Context

See proposal.md. The contracts are single-decision: one robot decides per `step`, so the whole existing machinery (registry, pipeline, hybrid, guard, evaluation, study, demo) applies unchanged. The lessons from the other three games shape the spike:
- report a hand-written baseline;
- keep choices decisive and break ties deterministically;
- measure error detection (AUROC) as well as agreement.

## Decisions

### Layout and fleet (starting values)
- Grid 32 × 20. Shelf blocks 2 × 6, arranged in rows with 1-cell aisles, and a 2-cell perimeter corridor. Stations along the left and right walls.
- 16 robots, placed on distinct free cells by the seed.
- **Goals.** They alternate between a shelf-access cell (a free cell next to a shelf) and a station, drawn from the environment stream. This is the classic warehouse pick cycle.
- **Episode.** 300 timesteps × 16 robots = 4,800 decisions. Deliveries count arrivals at either kind of goal.
- **Distance maps.** A BFS distance map per goal cell, computed on demand and cached per layout. Real warehouses precompute them; they count as environment infrastructure, not as System One's compute.

### Decision order and conflicts
Within a timestep, robots decide in the order `(start + k) mod N`. The environment keeps `claimed[next cell]` and `movedFrom` for robots that already decided. A move is blocked (counted as a collision, the robot waits) if the target is:
- a shelf or outside the grid;
- already claimed;
- occupied by a robot that has not decided yet;
- or if it swaps with a robot that decided to move into our cell.

Blocking a move into a cell whose occupant has not decided yet is conservative; it prevents chains of undecided moves, and it is exactly what the guard checks.

### Observation (252 values)
A 9×9 window centred on the robot, with 3 binary channels: shelf or outside, robot, own goal (243 values). Then the goal direction, as a unit vector (dx, dy) and the normalised distance (3 values). Then, for N/E/S/W, `(d(neighbour) − d(here))`, clamped to [−1, 1], or +1 if the neighbour is blocked (4 values). Then the share of the other robots within the window, and the fraction of the episode elapsed (2 values). Total: 243 + 3 + 4 + 2 = 252. Axes are absolute: no rotation, because warehouse directions are meaningful.

### Greedy baseline
Among wait and the four moves, take the one with the lowest distance-to-goal among cells that are not blocked by the guard's rules. Break ties in N, E, S, W order and prefer moving over waiting when the distance decreases. The baseline is O(1), and it deadlocks in aisles when two robots face each other.

### Teacher: cooperative space-time A* against predicted trajectories (after Silver, 2005)
The classic WHCA* keeps per-robot plans between queries, so two queries on the same state could report different costs; that breaks the determinism requirement. The teacher is therefore **stateless**:
- **Predicted trajectories.** For every other robot: robots that already decided occupy their claimed next cell at τ = 1; undecided robots follow the greedy shortest-path step of their distance map. From there, each robot follows its distance map for the rest of the window. These predicted cells (vertices per timestep, and the edges they traverse) form the reservation table.
- **Action score** for each action a of the deciding robot r: −1000 if the environment would block a. Otherwise, a time-layered space-time search starts from the resulting cell at τ = 1 (wait or move each step; no reserved vertex; no swap with a reserved edge). If the goal is reached at τ, the path length is τ; if not, it is the minimum of W + d(cell) over the frontier at τ = W. Score = −(path length).
- **Tie-breaking**: +0.3 for the greedy step (the distance-map action, the base policy, as for the lander), then +0.02 steps in N, E, S, W, wait order (all below one timestep).
- **Knob**: W ∈ {4, 8, 16} (levels 1/2/3); default level 2, W = 8.
- **Cost**: nodes expanded by the five searches, plus one per predicted trajectory step.
- Deterministic by construction: same state, same scores and cost.

### Guard
The checks from the conflicts section, plus a dead-end rule: if the target cell has only one free neighbour and a robot that already decided is moving out of the pocket through that neighbour, reject. Cost ≈ 5–10 inspected cells.

### τ
The τ rule from racing: smallest preference step / 3 = 0.0067.

### Feasibility spike
`experiments/warehouse-feasibility.ts`:
- criteria 1–2 on 20 dev seeds (teacher vs greedy);
- criteria 3–4: 40 training episodes of teacher labels (subsampled to about 30k states), 64×64 network, 30 epochs, measured on 10 teacher-driven dev episodes;
- AUROC of (1 − max probability) against disagreement.

Thresholds as in proposal.md; they are not changed after measuring.

## Risks / Trade-offs

- [Predicted trajectories ignore interactions, so the planner can still deadlock in 1-cell aisles] → corridors 2–3 cells wide limit head-on meetings; criterion 1 measures the gain over greedy.
- [Ties from symmetric moves (N vs E toward a diagonal goal)] → deterministic preference; criterion 2.
- [Local observation cannot see far congestion] → same limitation as Snake's window; the guard covers immediate conflicts, and criterion 3 measures imitability.
