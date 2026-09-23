# Spec Delta

## Purpose

Defines the game-agnostic common contract between environment, teacher (System Two), student (System One) and hybrid, so that the same pipeline serves Snake and later games by changing only the environment.

## ADDED Requirements

### Requirement: Environment contract
Every environment SHALL expose: reset from an integer seed, advancing one step given an action, the list of legal actions in the current state, encoding of the state into a numeric vector of fixed and declared length, and a textual rendering of the state. The number of actions and the encoding length MUST be constant for a given environment.

#### Scenario: Game step
- **WHEN** a legal action is applied to a non-terminated environment
- **THEN** the environment returns the step reward, whether the episode has ended and the current score

#### Scenario: Fixed-size encoding
- **WHEN** any reachable state is encoded
- **THEN** the vector has exactly the length declared by the environment and contains only finite values

### Requirement: Teacher contract
A teacher SHALL return, for a state, a score for each action (illegal actions marked as unavailable) and the decision cost expressed in integer compute units. The teacher MUST have a configurable cost knob.

#### Scenario: Scores for all legal actions
- **WHEN** the teacher is queried on a non-terminal state
- **THEN** every legal action receives a finite score and the reported cost is a positive integer

### Requirement: Student contract
A student SHALL decide with a single forward pass and return the chosen action, the probability distribution over actions (zero on illegal actions) and a confidence value in [0, 1], with a cost of 1 compute unit per decision.

#### Scenario: Well-formed probabilities
- **WHEN** the student decides on a state with at least one legal action
- **THEN** the probabilities sum to 1 within 1e-6, are zero on illegal actions and the chosen action is legal
