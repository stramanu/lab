# Spec Delta

## Purpose

Provides the System Two for Snake: an algorithmic planner, slow but strong, that scores every action and acts as the teacher for the micro-network, with a measurable and adjustable cost.

## ADDED Requirements

### Requirement: Per-action score with safety
For each legal action, the teacher SHALL simulate the move and assign a score that rewards getting closer to the food along a shortest path and penalizes moves after which the tail is no longer reachable from the head. Moves that lead to immediate death MUST receive the lowest possible score.

#### Scenario: Avoiding immediate death
- **WHEN** one of the three actions drives the head into a wall and the others do not
- **THEN** that action has a score strictly lower than every non-lethal action

#### Scenario: Preferring the safe path to the food
- **WHEN** there is an action that shortens the shortest path to the food while keeping the tail reachable
- **THEN** that action has the maximum score

### Requirement: Deterministic tie-breaking
When several actions are equivalent, the teacher SHALL break the tie deterministically, preferring straight, then left, then right, through a per-action bonus that is smaller than one unit of path distance (so it never overrides a real difference) but large enough to remain visible in the soft labels.

#### Scenario: Equivalent moves toward diagonal food
- **WHEN** the food is diagonally ahead-left so that straight and left shorten the path equally and both are safe
- **THEN** straight has the maximum score and its margin over left is at least 0.2

### Requirement: Adjustable-depth lookahead
The teacher SHALL support a simulated lookahead of configurable depth (0 = immediate evaluation only). Increasing the depth MUST NOT reduce the measured cost.

#### Scenario: Cost grows with depth
- **WHEN** the same state is queried at depth 0 and at depth 2
- **THEN** the cost reported at depth 2 is greater than or equal to the one at depth 0

### Requirement: Cost in compute units
The cost of every decision SHALL be reported as the number of expanded nodes (cells visited by the searches plus simulated states), deterministically for the same state and configuration.

#### Scenario: Deterministic cost
- **WHEN** the same state is queried twice with the same configuration
- **THEN** scores and cost match

### Requirement: Reference quality
With the default configuration, the teacher playing alone SHALL reach on 20x20 Snake an average length at least one order of magnitude above the random player on the evaluation seeds.

#### Scenario: Teacher versus random
- **WHEN** teacher and random player are evaluated on the same seeds
- **THEN** the teacher's average length is at least 10 times the random player's
