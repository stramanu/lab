# Spec Delta

## Purpose

Provides the racing guard: a single short rollout that rejects a proposed action if it would take the car off the track within a fraction of a second, at a small fraction of the planner's cost.

## ADDED Requirements

### Requirement: Off-track rejection
The racing guard SHALL simulate the proposed action for one decision followed by the base controller for a short horizon, and SHALL reject the action if the car leaves the track during that rollout.

#### Scenario: Doomed action
- **WHEN** the car is at speed at the track edge and the proposed action steers further outward
- **THEN** the guard rejects the action

#### Scenario: Safe action
- **WHEN** the car is slow on the centreline of a straight and the proposed action keeps it straight
- **THEN** the guard accepts the action

### Requirement: Guard cost
The guard cost SHALL be the number of physics steps it simulates, and its mean over a teacher-driven episode MUST be at most one tenth of the teacher's mean cost.

#### Scenario: Cheaper than the teacher
- **WHEN** the guard and the default teacher run on the states of a teacher-driven episode
- **THEN** the mean guard cost is at most one tenth of the mean teacher cost
