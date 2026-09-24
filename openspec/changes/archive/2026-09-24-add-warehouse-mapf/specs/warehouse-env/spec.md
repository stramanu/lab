# Spec Delta

## Purpose

Provides a lifelong multi-robot warehouse (multi-agent path finding in real time) as a decision-per-robot environment: a fleet moves between shelves and stations on a grid, and every robot's move is one decision with real consequences for traffic.

## ADDED Requirements

### Requirement: Layout, fleet and lifelong goals
The configuration SHALL determine a grid with shelf blocks separated by aisles and stations, and each seed SHALL determine the robots' starting cells and the stream of goal cells (cells next to shelves, alternating with stations). A robot that reaches its goal SHALL count one delivery and immediately receive its next goal.

#### Scenario: Delivery
- **WHEN** a robot moves onto its goal cell
- **THEN** the delivery count increases by one and the robot has a new goal

### Requirement: Decision order
A timestep SHALL consist of one decision per robot, in an order that rotates by one robot each timestep; the environment SHALL expose which robot is deciding. Robots that have already decided in the current timestep MUST have their next cell claimed.

#### Scenario: Rotating order
- **WHEN** a timestep ends
- **THEN** the next timestep starts with the robot after the one that started the previous timestep

### Requirement: Actions and conflicts
The actions SHALL be wait, north, east, south and west. A move into a shelf or outside the grid, into a cell occupied by a robot that has not moved away, into a cell already claimed for the next timestep, or that swaps cells with another robot SHALL be blocked (the robot waits) and counted as a collision.

#### Scenario: Vertex conflict
- **WHEN** a robot tries to move into a cell another robot has already claimed for the next timestep
- **THEN** the robot stays in place and the collision count increases

#### Scenario: Swap conflict
- **WHEN** two robots try to exchange their cells in the same timestep
- **THEN** the second move is blocked and counted as a collision

### Requirement: Determinism
Given the same seed and actions, the environment SHALL produce exactly the same states, goals and metrics.

#### Scenario: Reproducibility
- **WHEN** two episodes run with the same seed and actions
- **THEN** every state matches step by step

### Requirement: Observation
The encoding SHALL describe the deciding robot's surroundings in a fixed-size vector: a 9×9 egocentric window with channels for shelves or walls, other robots and its own goal, the direction to its goal, and, for each of the four neighbouring cells, the change in distance to goal from a precomputed shortest-path map.

#### Scenario: Fixed-size encoding
- **WHEN** any reachable state is encoded
- **THEN** the vector has the declared length and only finite values

### Requirement: Score and metrics
The score SHALL be the number of deliveries within the time limit. The summary SHALL report deliveries, collisions and the mean share of waiting moves.

#### Scenario: Summary
- **WHEN** an episode ends
- **THEN** the summary contains deliveries, collisions and the waiting share
