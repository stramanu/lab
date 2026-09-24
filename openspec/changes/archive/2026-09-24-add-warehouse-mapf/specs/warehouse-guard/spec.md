# Spec Delta

## Purpose

Provides the warehouse guard: a near-free check that rejects a robot's proposed move if it would collide with a cell or swap already claimed this timestep, or enter a dead-end pocket another robot is about to leave through.

## ADDED Requirements

### Requirement: Conflict rejection
The guard SHALL reject a proposed action that is blocked by a shelf or the grid edge, targets a claimed cell, targets a cell occupied by a robot that has not yet decided and is not known to move away, swaps with another robot, or enters a dead-end cell whose only exit another robot is about to use. It SHALL accept all other actions, including waiting.

#### Scenario: Claimed cell
- **WHEN** a robot proposes to move into a cell already claimed for the next timestep
- **THEN** the guard rejects the action

#### Scenario: Free cell
- **WHEN** a robot proposes to move into a free aisle cell that no one has claimed
- **THEN** the guard accepts the action

### Requirement: Guard cost
The guard cost SHALL be the number of cells it inspects, and its mean MUST be at most one tenth of the teacher's mean cost.

#### Scenario: Cheaper than the teacher
- **WHEN** the guard and the default teacher are run on the states of a teacher-controlled episode
- **THEN** the mean guard cost is at most one tenth of the mean teacher cost
