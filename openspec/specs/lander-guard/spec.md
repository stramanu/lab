# lander-guard Specification

## Purpose
Provides the lander's cheap safety check on the action proposed by System One: a single short rollout that rejects actions leading to a crash within about one second, so the hybrid escalates where a confident mistake would be fatal.

## Requirements

### Requirement: Short-rollout rejection
The lander guard SHALL simulate the proposed action for one decision, followed by a fixed recovery policy for a short horizon, and SHALL reject the action if the rollout ends in a crash or out of bounds. It SHALL accept actions whose rollout lands or stays in flight.

#### Scenario: Doomed action
- **WHEN** the ship is falling fast just above the ground and System One proposes "none"
- **THEN** the guard rejects the action

#### Scenario: Safe action high above the pad
- **WHEN** the ship is high above the pad, slow and upright, and System One proposes "none"
- **THEN** the guard accepts the action

### Requirement: Guard cost
The guard cost SHALL be the number of physics steps it simulates, and its mean over a teacher-played episode MUST be at most one tenth of the teacher's mean cost.

#### Scenario: Cheaper than the teacher
- **WHEN** the guard and the default teacher are both run on the states of a teacher-played episode
- **THEN** the mean guard cost is at most one tenth of the mean teacher cost
