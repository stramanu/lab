# training-pipeline Specification

## Purpose
Defines the three-phase training protocol (imitation, an escalation loop in which the teacher labels only the states it is queried on, consolidation) that compiles the teacher's slow reasoning into the micro-network's intuition, with logs that become the demo's curves.

## Requirements

### Requirement: Bootstrap phase
The pipeline SHALL have the teacher play K episodes on training seeds, add every visited state with its per-action scores to the dataset and train the network for a configurable number of epochs.

#### Scenario: Populated dataset
- **WHEN** the bootstrap phase ends
- **THEN** the dataset contains at least one labeled state for every move played by the teacher, net of duplicates

### Requirement: Escalation loop
The pipeline SHALL have the hybrid play on training seeds, using the game's guard when one is provided (enabled by default, configurable). Every escalated state, whether triggered by low confidence or by the guard, MUST be labeled by the teacher and added to the dataset, and a configurable random fraction of the states decided by the student MUST be labeled anyway (audit). The network MUST be retrained every M new examples.

#### Scenario: Audit of confident states
- **WHEN** the audit fraction is greater than zero
- **THEN** states decided with confidence above threshold are also labeled and their agreement with the teacher is recorded

#### Scenario: Guard-triggered labels
- **WHEN** the guard rejects a confident student action during the escalation loop
- **THEN** that state is labeled by the teacher and becomes a training or validation example

### Requirement: Fixed-capacity dataset with deduplication
The dataset SHALL have a configurable maximum capacity, replace the oldest examples when full and discard a state only if an identical encoding (compared as float32) is already present. States whose encodings differ in any value SHALL both be kept.

#### Scenario: Duplicate state
- **WHEN** a state with the same encoding as one already present is added
- **THEN** the dataset size does not increase

#### Scenario: Near-identical states
- **WHEN** two states whose encodings differ only below 1/255, or only in values outside [0, 1], are added
- **THEN** both are kept

### Requirement: Consolidation
The pipeline SHALL end with a final training, estimation of the calibration temperature on a separate validation set, and freezing of the exported weights.

#### Scenario: Final weights
- **WHEN** the pipeline ends
- **THEN** a reloadable weights file is produced that includes the calibration temperature

### Requirement: Per-iteration log
For every iteration the pipeline SHALL record phase, loss, agreement with the teacher, escalation rate, the share of escalations triggered by the guard, average score, dataset size and elapsed time, in a machine-readable format.

#### Scenario: Escalation curve
- **WHEN** the escalation loop is running
- **THEN** every iteration appends a log line with the escalation rate and the guard-triggered share

### Requirement: Reproducibility
Given the same configuration and seed, two runs of the pipeline SHALL produce the same final weights.

#### Scenario: Same seed, same weights
- **WHEN** the pipeline is run twice with the same configuration
- **THEN** the produced weight files are identical

### Requirement: Fine-tuning from initial weights
The continuous pipeline SHALL accept an optional initial ensemble, of the same architecture, and start its bootstrap training from those weights instead of random ones; without it, training SHALL be unchanged.

#### Scenario: Starts from the given weights
- **WHEN** a pipeline is created with an initial ensemble
- **THEN** before any training its ensemble's actions equal those of the initial ensemble
