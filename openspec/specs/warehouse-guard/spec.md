# warehouse-guard Specification

## Purpose
Provides the warehouse guard: a near-free check that rejects a robot's proposed move if it would collide with a cell or swap already claimed this timestep, or step into a dead-end cell that is not the robot's goal.

## Requirements

### Requirement: Conflict rejection
The guard SHALL reject a proposed action that is blocked by a shelf or the grid edge, targets a claimed cell, targets a cell occupied by a robot that has not yet decided and is not known to move away, or swaps with another robot. It SHALL also reject a move into a dead-end cell (at most one walkable neighbour) that is not the robot's goal. It SHALL accept all other actions, including waiting.

#### Scenario: Claimed cell
- **WHEN** a robot proposes to move into a cell already claimed for the next timestep
- **THEN** the guard rejects the action

#### Scenario: Free cell
- **WHEN** a robot proposes to move into a free aisle cell that no one has claimed
- **THEN** the guard accepts the action

#### Scenario: Dead end that is not the goal
- **WHEN** a robot proposes to move into a free cell with only one walkable neighbour, and that cell is not its goal
- **THEN** the guard rejects the action

### Requirement: Guard cost
The guard cost SHALL be the number of cells it inspects, and its mean MUST be at most one tenth of the teacher's mean cost.

#### Scenario: Cheaper than the teacher
- **WHEN** the guard and the default teacher are run on the states of a teacher-controlled episode
- **THEN** the mean guard cost is at most one tenth of the mean teacher cost
