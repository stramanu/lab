# Spec Delta

## Purpose

Reproducibly evaluates the four experimental conditions on fixed seeds disjoint from training, producing the numbers needed to confirm or reject hypotheses H1–H4.

## ADDED Requirements

### Requirement: Fixed and disjoint evaluation seeds
Evaluation SHALL use 200 fixed, published seeds, disjoint from any seed used in training.

#### Scenario: Seed disjointness
- **WHEN** the training and evaluation seed sets are compared
- **THEN** their intersection is empty

### Requirement: Experimental conditions
Evaluation SHALL run the conditions Random, System Two alone (at one or more levels of the cost knob), System One alone and Hybrid at thresholds 0.5 / 0.7 / 0.8 / 0.9 / 0.95, all on the same seeds.

#### Scenario: Full run
- **WHEN** evaluation is launched with trained weights
- **THEN** the report contains a result for each condition and threshold

### Requirement: Per-condition metrics
For every condition the report SHALL contain: mean score with 95% confidence interval, median, distribution of end reasons, mean cost per move in compute units, mean time per move in microseconds, number of System Two calls, percentage of escalated moves and agreement with the teacher (for the hybrid), ECE and reliability diagram data (for conditions with a student).

#### Scenario: Agreement above threshold
- **WHEN** the hybrid is evaluated
- **THEN** the report shows the agreement rate with the teacher computed only over decisions above threshold

### Requirement: Hypothesis verification
The report SHALL include, for H1–H4, the measured value, the declared target and the outcome (confirmed or not), without altering targets based on the results.

#### Scenario: H2 outcome
- **WHEN** the report is generated
- **THEN** for H2 it reports the hybrid/System Two score ratio and the cost-per-move ratio, compared with the 90% and 10x targets

### Requirement: Machine- and human-readable report
Evaluation SHALL write a complete JSON report and print a human-readable table in the terminal, including parameter count, weight size in KB and hardware characteristics.

#### Scenario: CLI output
- **WHEN** evaluation ends
- **THEN** a JSON report file exists and the terminal shows a table with one row per condition
