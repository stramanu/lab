# handwriting-data Specification

## Purpose
Provides the handwriting dataset: the uppercase letters of UJI Pen Characters v2, acquired reproducibly, split by writer, and preprocessed identically for every recogniser.

## Requirements

### Requirement: Reproducible acquisition
The system SHALL provide a script that downloads UJI Pen Characters v2 from the UCI Machine Learning Repository, verifies the archive against a recorded SHA-256 hash, extracts the samples labelled with an uppercase letter A–Z, and writes a derived file together with an attribution notice stating the source, the authors and the CC BY 4.0 licence. The script SHALL report the number of samples per writer and per letter, and any deviation from 2 per writer and letter.

#### Scenario: Hash mismatch
- **WHEN** the downloaded archive's hash differs from the recorded one
- **THEN** the script stops with an error and writes nothing

#### Scenario: Expected subset
- **WHEN** the script runs on the recorded archive
- **THEN** the derived file contains only uppercase letters A–Z, and the notice file exists

### Requirement: Writer-independent split
The test split SHALL be the database's documented "tst" writers. The database's "trn" writers, sorted by identifier, SHALL be assigned to dev when their index mod 4 is 0, and to train otherwise. No writer SHALL appear in more than one split. Only the study script SHALL read test samples; experiments SHALL use train and dev only.

#### Scenario: Disjoint writers
- **WHEN** the split is computed
- **THEN** the train, dev and test writer sets are pairwise disjoint and together contain every writer

#### Scenario: Test samples guarded
- **WHEN** an experiment script requests test samples
- **THEN** it fails with an error

### Requirement: Preprocessing
A sample SHALL be preprocessed by joining its strokes in writing order, centring its bounding box at the origin, scaling it by its larger side into [−1, 1] with the aspect ratio kept, and resampling it to 32 points equidistant along the ink, with each point keeping its stroke index. Preprocessing SHALL be deterministic.

#### Scenario: Normalised and resampled
- **WHEN** any sample is preprocessed
- **THEN** it has exactly 32 points, all coordinates lie in [−1, 1], and the larger bounding-box side spans the full range

#### Scenario: Aspect ratio kept
- **WHEN** a tall, thin stroke is preprocessed
- **THEN** its width stays smaller than its height

### Requirement: Training augmentation
Training samples SHALL be augmented, before resampling, by a random rotation in [−10°, 10°], independent x and y scaling in [0.85, 1.15], a shear in [−0.2, 0.2] and Gaussian point jitter with standard deviation 0.01, drawn from a seeded stream. Dev and test samples SHALL never be augmented.

#### Scenario: Seeded
- **WHEN** the same sample is augmented twice with the same seed
- **THEN** the results are identical
