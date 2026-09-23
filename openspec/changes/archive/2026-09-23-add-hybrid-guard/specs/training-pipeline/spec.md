# Spec Delta

## MODIFIED Requirements

### Requirement: Escalation loop
The pipeline SHALL have the hybrid play on training seeds, using the game's guard when one is provided (enabled by default, configurable). Every escalated state, whether triggered by low confidence or by the guard, MUST be labeled by the teacher and added to the dataset, and a configurable random fraction of the states decided by the student MUST be labeled anyway (audit). The network MUST be retrained every M new examples.

#### Scenario: Audit of confident states
- **WHEN** the audit fraction is greater than zero
- **THEN** states decided with confidence above threshold are also labeled and their agreement with the teacher is recorded

#### Scenario: Guard-triggered labels
- **WHEN** the guard rejects a confident student action during the escalation loop
- **THEN** that state is labeled by the teacher and becomes a training or validation example

### Requirement: Per-iteration log
For every iteration the pipeline SHALL record phase, loss, agreement with the teacher, escalation rate, the share of escalations triggered by the guard, average score, dataset size and elapsed time, in a machine-readable format.

#### Scenario: Escalation curve
- **WHEN** the escalation loop is running
- **THEN** every iteration appends a log line with the escalation rate and the guard-triggered share
