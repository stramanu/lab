# Spec Delta

## Purpose

Provides the System Two for the warehouse: a windowed cooperative space-time search that scores each action of the deciding robot by the best space-time path it leaves open toward the goal, given the other robots' planned moves, with a measurable cost.

## ADDED Requirements

### Requirement: Cooperative action scores
For the deciding robot, the teacher SHALL score each of the five actions by the length of the shortest space-time path from the resulting cell toward the goal within a window. The path MUST avoid the cells and swaps of the other robots' predicted trajectories within the window (claimed cells for robots that already decided, distance-map paths otherwise), and MUST use the precomputed distance map as the heuristic beyond the window. An action that collides immediately SHALL score lower than any action that does not.

#### Scenario: Blocked cell
- **WHEN** the neighbouring cell toward the goal is claimed for the next timestep
- **THEN** moving into it scores lower than waiting

### Requirement: Determinism, tie-breaking and cost
The teacher SHALL be deterministic, SHALL break ties with a root-only preference whose spread is below one timestep of path length, and SHALL report its cost as the number of search nodes expanded. The window length SHALL be configurable, and a longer window MUST NOT cost less.

#### Scenario: Same state, same answer
- **WHEN** the teacher is queried twice on the same state
- **THEN** scores and cost are identical

### Requirement: Reference quality
With the default window, the teacher playing every robot SHALL be collision-free and SHALL deliver at least 20% more than the greedy baseline on the same seeds (feasibility criterion 1).

#### Scenario: Teacher versus greedy
- **WHEN** teacher and greedy baseline control the same fleets on the same seeds
- **THEN** the teacher has zero collisions and at least 1.2 times the greedy deliveries
