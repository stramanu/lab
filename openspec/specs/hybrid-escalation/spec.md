# hybrid-escalation Specification

## Purpose
Combines System One and System Two: the micro-network always decides first and escalates to the teacher when its confidence is below threshold, recording who made each move and how much it cost.

## Requirements

### Requirement: Confidence-threshold decision
The hybrid SHALL query the student first. If the student's confidence is below the configured threshold, the hybrid escalates. Otherwise, if a guard is configured, the hybrid checks the student's action with the guard and escalates if the guard rejects it. When not escalating, the hybrid plays the student's move; when escalating, it queries the teacher and plays the teacher's highest-scoring action.

#### Scenario: High confidence
- **WHEN** the student's confidence is above the threshold and no guard is configured
- **THEN** the student's action is played and the teacher is not queried

#### Scenario: Escalation
- **WHEN** the student's confidence is below the threshold
- **THEN** the teacher's best action is played, the decision is recorded as escalated and the guard is not run

#### Scenario: Guard rejection
- **WHEN** the student is confident but the guard rejects its action
- **THEN** the teacher's best action is played and the decision is recorded as escalated by the guard

#### Scenario: Guard acceptance
- **WHEN** the student is confident and the guard accepts its action
- **THEN** the student's action is played and the teacher is not queried

### Requirement: Selectable confidence measure
Confidence SHALL be computable either as the maximum probability or as the margin between the first and second probability, selected via configuration.

#### Scenario: Margin
- **WHEN** the probabilities are 0.6, 0.3 and 0.1 and the measure is the margin
- **THEN** the confidence is 0.3

### Requirement: Decision log
For every move the hybrid SHALL record who decided (System One or System Two), the escalation reason when escalated (`confidence` or `guard`), the confidence, the probabilities, the cost in compute units including any guard cost, the guard cost on its own when a guard ran and, when available, whether the student agreed with the teacher.

#### Scenario: Cost of an escalated move
- **WHEN** a move is escalated because of low confidence
- **THEN** the recorded cost is the sum of the forward pass (1 unit) and the teacher's cost

#### Scenario: Cost of a guard-escalated move
- **WHEN** a move is escalated because the guard rejected it
- **THEN** the recorded cost is the sum of the forward pass, the guard cost and the teacher's cost

### Requirement: Extreme thresholds
Without a guard, the hybrid SHALL behave as the student alone with threshold 0 and as the teacher alone with a threshold strictly greater than 1. With a guard and threshold 0, it SHALL escalate only on guard rejections.

#### Scenario: Zero threshold
- **WHEN** the threshold is 0 and no guard is configured
- **THEN** no move is escalated

#### Scenario: Guard only
- **WHEN** the threshold is 0 and a guard is configured
- **THEN** every escalation has reason `guard`
