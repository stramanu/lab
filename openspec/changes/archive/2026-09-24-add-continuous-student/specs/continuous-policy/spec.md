# Spec Delta

## Purpose

Provides a System One for continuous control: an ensemble of small networks that regresses the planner's continuous action and measures its own uncertainty from the members' disagreement, so it can decide when to hand control to the planner.

## ADDED Requirements

### Requirement: Ensemble regression
The continuous policy SHALL consist of K independently initialised MLPs with the same architecture, each trained by mean-squared error on the teacher's continuous action for the same examples, with its own seed for initialisation and shuffling. Its action SHALL be the element-wise mean of the members' outputs, clamped to the action bounds.

#### Scenario: Members differ, mean is the action
- **WHEN** an ensemble with K = 5 is created from a seed and asked for an action
- **THEN** the members' parameters differ from each other and the returned action is the clamped mean of their outputs

#### Scenario: Training reduces the error
- **WHEN** the ensemble is trained on a fixed dataset of (state, action) pairs
- **THEN** the mean-squared error of the ensemble mean on that dataset decreases

### Requirement: Disagreement confidence
The policy SHALL report a disagreement value (the mean over action dimensions of the members' standard deviation, each dimension divided by its action range) and a confidence in [0, 1] that decreases monotonically with it. The mapping SHALL be fitted on validation data so that the confidence approximates the probability that the action agrees with the teacher under the continuous agreement definition.

#### Scenario: Unanimous members
- **WHEN** all members output the same action
- **THEN** the disagreement is 0 and the confidence is the maximum of the mapping

### Requirement: Cost
One decision of the continuous policy SHALL cost K compute units, one per member forward pass.

#### Scenario: Ensemble cost
- **WHEN** a K = 5 ensemble decides
- **THEN** the reported cost is 5

### Requirement: Serialization
The ensemble, its action bounds and its confidence mapping SHALL be exportable and re-importable, producing identical actions and confidences.

#### Scenario: Round trip
- **WHEN** a trained ensemble is exported and re-imported
- **THEN** actions and confidences on a set of states match within 1e-6

### Requirement: Continuous players
The system SHALL provide, for continuous games:
- a System One player that acts with the ensemble's mean action;
- a hybrid player that acts with the ensemble when its confidence is at least the threshold and the guard (if configured) accepts the continuous action, and otherwise plays the planner's action, recording the escalation reason;
- a guard-only variant (threshold 0).

Every move SHALL record the decider, the confidence, the cost (ensemble cost, plus guard and planner costs when they run) and, when the planner is queried, whether the ensemble's action agreed with the planner's continuous action.

#### Scenario: Low-confidence escalation
- **WHEN** the ensemble's confidence is below the threshold
- **THEN** the planner's action is played, the move is recorded as escalated for confidence, and its cost is the ensemble cost plus the planner cost

#### Scenario: Guard rejection of a continuous action
- **WHEN** the ensemble is confident but the guard rejects its continuous action
- **THEN** the planner's action is played and the move is recorded as escalated by the guard

### Requirement: Continuous training
A continuous game SHALL be trained with the same three-phase protocol as discrete games:
- bootstrap on planner-driven episodes;
- escalation iterations in which the hybrid plays and every state where the planner is queried (escalation or audit) becomes a regression example;
- consolidation with a final training and a confidence map fitted on a validation split by episode segment.

Given the same configuration and seed, two runs SHALL produce identical ensembles.

#### Scenario: Reproducible ensemble
- **WHEN** the continuous pipeline is run twice with the same reduced configuration
- **THEN** the exported ensembles are identical
