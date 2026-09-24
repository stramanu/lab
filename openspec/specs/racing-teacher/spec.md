# racing-teacher Specification

## Purpose
Provides the System Two for racing: a deterministic rollout planner that explores a small tree of actions with the game's physics and lets a base controller drive each branch, scoring actions by the progress they lead to without leaving the track.

## Requirements

### Requirement: Rollout scores
For each action, the teacher SHALL simulate every continuation of a configurable number of further one-decision actions, then the base controller for a fixed horizon, and score each branch by the progress reached, with leaving the track scoring below any branch that stays on it. An action's score SHALL be its best branch.

#### Scenario: Avoiding a crash
- **WHEN** the car is fast, close to a sharp corner, and only braking keeps it on track
- **THEN** a braking action has the highest score

### Requirement: Determinism and tie-breaking
The teacher SHALL be deterministic, and SHALL break ties between equivalent actions with a root-only preference whose spread is smaller than any meaningful progress difference.

#### Scenario: Same state, same answer
- **WHEN** the teacher is queried twice on the same state
- **THEN** scores and cost are identical

### Requirement: Cost units and knob
The tree depth and the rollout horizon SHALL be configurable, and the cost SHALL be the number of physics steps simulated.

#### Scenario: Cost grows with depth
- **WHEN** the same state is queried with a deeper tree
- **THEN** the reported cost is greater

### Requirement: Reference quality
With the default configuration, the teacher SHALL stay on track in at least 90% of episodes and cover at least 10% more distance than the base controller on the same seeds (feasibility criteria 1 and 2).

#### Scenario: Teacher versus base controller
- **WHEN** teacher and base controller drive the same seeds
- **THEN** the teacher stays on track in at least 90% of episodes and its mean progress is at least 1.1 times the controller's
