# lander-teacher Specification

## Purpose
Provides the System Two for the lander: a receding-horizon planner that simulates the future with the game's own physics, exploring a small tree of candidate actions and letting a base autopilot fly each branch to the end. Each action is scored by the best outcome it can reach, with a measurable and adjustable cost.

## Requirements

### Requirement: Per-action lookahead scores
For each of the four actions, the teacher SHALL simulate, with the game's physics, every continuation of a configurable number of further one-decision actions, followed by a fixed base autopilot until the episode ends or a rollout horizon expires. It SHALL score each branch by its outcome: a landing scores the game score (higher with more fuel left), and a crash, out-of-bounds or unfinished branch scores worse than any landing. Each action's score SHALL be the best branch score among the branches that start with that action.

#### Scenario: Obvious crash avoidance
- **WHEN** the ship is falling fast just above the pad and upright, so that braking now lands and waiting one decision crashes
- **THEN** the main engine has the highest score

#### Scenario: Scores for every action
- **WHEN** the teacher is queried on a non-terminal state
- **THEN** all four actions receive a finite score

### Requirement: Deterministic tie-breaking
The teacher SHALL treat actions whose outcomes are within a configurable satisficing margin of the best as equivalent, and SHALL break ties among them deterministically with a root-only preference: first the autopilot's own action, then none, main engine, left, right. The total preference spread MUST be far smaller than the gap between any landing and any crash, so an action that can land always outranks one that cannot.

#### Scenario: Equivalent actions
- **WHEN** every action leads to an equivalent landing outcome
- **THEN** the autopilot's action has the highest score and the scores are all distinct

### Requirement: Deterministic planning
The teacher SHALL be deterministic: the same state and configuration always give the same scores and cost.

#### Scenario: Same state, same answer
- **WHEN** the teacher is queried twice on the same state
- **THEN** scores and cost are identical

### Requirement: Never worse than the autopilot
Because the plain autopilot continuation of every first action is among the evaluated branches, and the next decision's tree contains the continuation of the current best branch, the teacher playing alone SHALL land at least as often as the base autopilot on the same seeds.

#### Scenario: Teacher versus autopilot
- **WHEN** teacher and autopilot are evaluated on the same seeds
- **THEN** the teacher's landing rate is greater than or equal to the autopilot's

### Requirement: Cost knob and cost units
The tree depth and the rollout horizon SHALL be configurable. The decision cost SHALL be the number of physics steps simulated, so it grows with both.

#### Scenario: Cost grows with the knob
- **WHEN** the same state is queried with a deeper tree or a longer rollout horizon
- **THEN** the reported cost is greater

### Requirement: Reference quality
With the default configuration, the teacher playing alone SHALL land in at least 90% of the evaluation seeds, while the random player lands in at most 5%.

#### Scenario: Teacher versus random
- **WHEN** teacher and random player are evaluated on the same seeds
- **THEN** the teacher's landing rate is at least 90% and the random player's is at most 5%
