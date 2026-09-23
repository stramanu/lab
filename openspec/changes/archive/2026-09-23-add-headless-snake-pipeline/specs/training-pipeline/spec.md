# Spec Delta

## Purpose

Defines the three-phase training protocol (imitation, DAgger-style escalation, consolidation) that compiles the teacher's slow reasoning into the micro-network's intuition, with logs that become the demo's curves.

## ADDED Requirements

### Requirement: Bootstrap phase
The pipeline SHALL have the teacher play K episodes on training seeds, add every visited state with its per-action scores to the dataset and train the network for a configurable number of epochs.

#### Scenario: Populated dataset
- **WHEN** the bootstrap phase ends
- **THEN** the dataset contains at least one labeled state for every move played by the teacher, net of duplicates

### Requirement: Escalation loop
The pipeline SHALL have the hybrid play on training seeds; every escalated state MUST be labeled by the teacher and added to the dataset, and a configurable random fraction of the states decided by the student MUST be labeled anyway (audit). The network MUST be retrained every M new examples.

#### Scenario: Audit of confident states
- **WHEN** the audit fraction is greater than zero
- **THEN** states decided with confidence above threshold are also labeled and their agreement with the teacher is recorded

### Requirement: Fixed-capacity dataset with deduplication
The dataset SHALL have a configurable maximum capacity, replace the oldest examples when full and discard states whose encoding matches one already present.

#### Scenario: Duplicate state
- **WHEN** a state with the same encoding as one already present is added
- **THEN** the dataset size does not increase

### Requirement: Consolidation
The pipeline SHALL end with a final training, estimation of the calibration temperature on a separate validation set, and freezing of the exported weights.

#### Scenario: Final weights
- **WHEN** the pipeline ends
- **THEN** a reloadable weights file is produced that includes the calibration temperature

### Requirement: Per-iteration log
For every iteration the pipeline SHALL record phase, loss, agreement with the teacher, escalation rate, average score, dataset size and elapsed time, in a machine-readable format.

#### Scenario: Escalation curve
- **WHEN** the escalation loop is running
- **THEN** every iteration appends a log line with the escalation rate

### Requirement: Reproducibility
Given the same configuration and seed, two runs of the pipeline SHALL produce the same final weights.

#### Scenario: Same seed, same weights
- **WHEN** the pipeline is run twice with the same configuration
- **THEN** the produced weight files are identical
