# research-experiments Specification

## Purpose
Makes every published claim reproducible: each claim is backed by a committed, seeded experiment script that runs on the dev split and writes a machine-readable result, and every design decision is traceable in an experiment log.

## Requirements

### Requirement: One script per claim
Every quantitative claim in the README that is not part of the main evaluation SHALL be produced by a committed experiment script that runs with a single command and writes a JSON result file containing the claim's numbers, the split, the seeds and the configuration used.

#### Scenario: Reproducing a claim
- **WHEN** a reader runs the experiment script named next to a README claim
- **THEN** the JSON result contains the numbers quoted in the README for that claim

### Requirement: Dev split only
Experiment scripts SHALL use only training and dev seeds, never test seeds.

#### Scenario: No test seeds in experiments
- **WHEN** an experiment script runs
- **THEN** none of the seeds it plays or evaluates belong to the test split

### Requirement: Determinism
Experiment scripts SHALL be deterministic given their configuration: running one twice MUST produce the same numbers, with wall-clock timings excepted.

#### Scenario: Same numbers twice
- **WHEN** an experiment script is run twice with the same configuration
- **THEN** its non-timing results are identical

### Requirement: Experiment log
The repository SHALL contain an experiment log that lists, in chronological order, every design decision that affects results, the evidence it rested on (script and split, or archived design note) and whether it was taken on contaminated evidence and later re-validated.

#### Scenario: Traceable decision
- **WHEN** a reader looks up why the Snake guard was introduced
- **THEN** the log names the evidence, the split it was measured on and the dev-split re-validation result
