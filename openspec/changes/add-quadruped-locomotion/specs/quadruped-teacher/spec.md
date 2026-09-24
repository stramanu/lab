# Spec Delta

## Purpose

Provides the quadruped's hand-written base controller (trot gait, inverse kinematics, Raibert-style foot placement) and the rollout planner that improves on it by simulating candidate modulations in the physics engine.

## ADDED Requirements

### Requirement: Base controller
The base controller SHALL produce joint targets from a trot gait generator, per-leg inverse kinematics, foot placement corrected by the trunk velocity, and a roll and pitch correction. It SHALL be a deterministic function of the environment state.

#### Scenario: Walks without pushes
- **WHEN** the base controller plays a 20 s episode without pushes
- **THEN** the robot does not fall and moves forward

### Requirement: Rollout planner
The planner SHALL score each of a fixed set of 21 candidate actions by restoring a snapshot of the current state, applying the candidate for one decision and the zero action until the horizon, without future pushes. The score SHALL be the forward progress, minus 100 if a fall occurs, plus 0.02 for the zero action. The planner SHALL choose the zero action when its score is within the satisficing margin of the best, and the best-scoring candidate otherwise. Its horizon SHALL be 0.5, 1 or 2 s for levels 1, 2 and 3.

#### Scenario: Same state, same answer
- **WHEN** the planner is queried twice on the same state
- **THEN** it returns the same action, scores and cost

#### Scenario: No worse than the base controller
- **WHEN** the zero action leads to a fall within the horizon and another candidate does not
- **THEN** the planner does not choose the zero action

#### Scenario: Longer horizon costs more
- **WHEN** levels 1, 2 and 3 are queried on the same state
- **THEN** their costs are strictly increasing

### Requirement: Planner cost
The planner's cost SHALL be the number of physics steps it simulates, and it SHALL not alter the live environment.

#### Scenario: Live state untouched
- **WHEN** the planner is queried
- **THEN** the environment's state afterwards is identical to its state before the query
