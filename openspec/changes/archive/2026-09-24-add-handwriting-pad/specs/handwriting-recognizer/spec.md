# Spec Delta

## Purpose

Provides the two handwriting recognisers, an MLP classifier and the $P point-cloud recogniser, with comparable cost accounting, calibration, and a multi-run study against pre-registered targets.

## ADDED Requirements

### Requirement: Encodings
The system SHALL provide two encodings of a preprocessed sample: a trajectory encoding with 160 values (x, y, cos θ, sin θ and a stroke-start flag for each of the 32 points) and a raster encoding with 256 values (ink coverage on a 16×16 grid, clamped to [0, 1]). The encoding used by the study SHALL be chosen by a committed dev-only experiment and logged before the study runs.

#### Scenario: Sizes and ranges
- **WHEN** a sample is encoded
- **THEN** the trajectory encoding has 160 finite values, and the raster encoding has 256 values in [0, 1]

### Requirement: MLP classifier
The MLP recogniser SHALL map an encoding through two hidden layers of 64 ReLU units to 26 softmax outputs, and SHALL be trained with cross-entropy on the true labels with training augmentation. A temperature SHALL be fitted on dev writers. A recognition SHALL return the top-k letters with calibrated probabilities, and its cost SHALL be twice the number of multiply–accumulate operations of the forward pass.

#### Scenario: Learns the training set
- **WHEN** the MLP is trained on the train writers
- **THEN** its top-1 accuracy on the unaugmented training samples is at least 95%

#### Scenario: Deterministic training
- **WHEN** training runs twice with the same run seed
- **THEN** the resulting weights are identical

### Requirement: $P baseline
The system SHALL implement the $P recogniser of Vatavu, Anthony and Wobbrock (2012) with n = 32 and ε = 0.5, using every training sample as a template. A recognition SHALL return the top-k distinct letters by distance, and its cost SHALL be five operations per point-to-point distance evaluation.

#### Scenario: Recognises its own templates
- **WHEN** $P recognises a sample that is one of its templates
- **THEN** it returns that sample's letter with distance 0

#### Scenario: Invariant to stroke order
- **WHEN** the strokes of a multistroke sample are reordered, or one stroke is reversed
- **THEN** $P returns the same letter

### Requirement: Study with pre-registered targets
The study SHALL train 5 MLP runs (run seeds 1–5), evaluate each on the test writers and $P once, and write a JSON file with per-run and aggregated (Student-t 95% interval) top-1 and top-3 accuracy, ECE before and after temperature scaling, cost per recognition, the confusion matrix and the 10 most frequent confusions. It SHALL check these targets on the means and tally the runs where each holds:
- R1: MLP top-1 ≥ 90%;
- R2: MLP top-1 ≥ $P top-1 − 3 points, and $P cost ÷ MLP cost ≥ 100;
- R3: MLP ECE after temperature scaling ≤ 0.05.

#### Scenario: Study output
- **WHEN** the study completes
- **THEN** the JSON file contains the 5 runs, the $P evaluation, the aggregates, the confusions and R1–R3 with their tallies
