# Spec Delta

## Purpose

Combines System One and System Two: the micro-network always decides first and escalates to the teacher when its confidence is below threshold, recording who made each move and how much it cost.

## ADDED Requirements

### Requirement: Confidence-threshold decision
The hybrid SHALL query the student first; if its confidence is greater than or equal to the configured threshold it plays the student's move, otherwise it queries the teacher and plays the teacher's highest-scoring action.

#### Scenario: High confidence
- **WHEN** the student's confidence is above the threshold
- **THEN** the student's action is played and the teacher is not queried

#### Scenario: Escalation
- **WHEN** the student's confidence is below the threshold
- **THEN** the teacher's best action is played and the decision is recorded as escalated

### Requirement: Selectable confidence measure
Confidence SHALL be computable either as the maximum probability or as the margin between the first and second probability, selected via configuration.

#### Scenario: Margin
- **WHEN** the probabilities are 0.6, 0.3 and 0.1 and the measure is the margin
- **THEN** the confidence is 0.3

### Requirement: Decision log
For every move the hybrid SHALL record who decided (System One or System Two), the confidence, the probabilities, the cost in compute units and, when available, whether the student agreed with the teacher.

#### Scenario: Cost of an escalated move
- **WHEN** a move is escalated
- **THEN** the recorded cost is the sum of the forward pass (1 unit) and the teacher's cost

### Requirement: Extreme thresholds
With threshold 0 the hybrid SHALL behave as the student alone; with a threshold strictly greater than 1 it SHALL behave as the teacher alone.

#### Scenario: Zero threshold
- **WHEN** the threshold is 0
- **THEN** no move is escalated
