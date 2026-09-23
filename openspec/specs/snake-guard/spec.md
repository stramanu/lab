# snake-guard Specification

## Purpose
Provides a cheap safety check for Snake that verifies the move proposed by System One, rejecting moves that die immediately or leave the tail unreachable, so the hybrid can escalate exactly where a confident mistake would be fatal.

## Requirements

### Requirement: Reject lethal and trapping moves
The Snake guard SHALL simulate the proposed action and reject it if the snake dies on that step, or if after the step the tail is no longer reachable from the head. It SHALL accept every other action, including winning moves.

#### Scenario: Immediate death
- **WHEN** the proposed action drives the head into a wall or the body
- **THEN** the guard rejects it

#### Scenario: Self-trap
- **WHEN** the proposed action leaves the head in a region from which the tail cannot be reached
- **THEN** the guard rejects it

#### Scenario: Safe move
- **WHEN** the proposed action keeps the tail reachable on an open board
- **THEN** the guard accepts it

### Requirement: Guard cost
The guard cost SHALL be 1 unit for the simulated step plus the number of cells expanded by the reachability search, which MUST stop as soon as the tail is found.

#### Scenario: Cheaper than the teacher
- **WHEN** the guard and the default teacher are both run on the states of a teacher-played episode
- **THEN** the mean guard cost is at most one tenth of the mean teacher cost
