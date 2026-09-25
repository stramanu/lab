# quadruped-guard Specification

## Purpose
Provides the quadruped guard: a short simulated rollout that rejects a proposed action if the robot would fall or tilt dangerously within 0.2 s.

## Requirements

### Requirement: Short-rollout fall check
The guard SHALL simulate the proposed action for one decision and then the zero action, up to 0.2 s, from a snapshot and without pushes. It SHALL reject the action if a fall occurs, or if the trunk tilts more than 45°, and accept it otherwise. It SHALL not alter the live environment.

#### Scenario: Falling action rejected
- **WHEN** the robot is tilted near the limit and the proposed action makes it fall within 0.2 s
- **THEN** the guard rejects it

#### Scenario: Calm walking accepted
- **WHEN** the robot walks steadily and the zero action is proposed
- **THEN** the guard accepts it

### Requirement: Guard cost
The guard cost SHALL be the physics steps it simulates, and its mean SHALL be at most one tenth of the level-2 planner's mean cost.

#### Scenario: Cheaper than the planner
- **WHEN** the guard and the level-2 planner run on the states of a planner-driven episode
- **THEN** the mean guard cost is at most one tenth of the mean planner cost
