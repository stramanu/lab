# Spec Delta

## Purpose

Provides a headless, deterministic top-down racing game with a procedural closed track and car physics that limit cornering grip, as the third testbed of the System One / System Two pipeline and a first step toward driving problems.

## ADDED Requirements

### Requirement: Procedural track
Each seed SHALL determine a closed, smooth, non-self-intersecting track centreline of fixed width, the car's starting pose on it and the track's direction of travel.

#### Scenario: Seeded track
- **WHEN** two episodes are reset with the same seed
- **THEN** the tracks and starting poses are identical, and they differ for a different seed

### Requirement: Car physics
The car SHALL move with a kinematic bicycle model: speed along the heading, a yaw rate given by speed and steering angle over the wheelbase, pedal inputs that accelerate or brake, and rolling drag. The lateral acceleration MUST be capped by a friction limit: beyond it, the car turns less than commanded (it slides wide) and loses speed.

#### Scenario: Straight-line acceleration
- **WHEN** the car accelerates with straight steering from rest
- **THEN** its speed increases and its heading does not change

#### Scenario: Friction limit
- **WHEN** the car steers fully at a speed where the commanded lateral acceleration exceeds the friction limit
- **THEN** the realised yaw rate is lower than the commanded one and the lateral acceleration equals the limit

### Requirement: Actions
The actions SHALL be the combinations of three incremental steering commands (turn the steering target left by a fixed step, hold it, turn it right by a fixed step, within a maximum angle) and two pedal states (accelerate, brake). All actions MUST be legal in every non-terminal state.

#### Scenario: Legal actions
- **WHEN** the episode is running
- **THEN** every action is legal

### Requirement: Episode end and score
The episode SHALL end when the car's centre leaves the track or when the time limit expires. The score SHALL be the distance progressed along the centreline, counted forward and across laps.

#### Scenario: Leaving the track
- **WHEN** the car's lateral distance from the centreline exceeds half the track width
- **THEN** the episode ends as off-track, with the progress reached so far as score

### Requirement: Determinism
Given the same seed and the same actions, the game SHALL produce exactly the same states.

#### Scenario: Reproducibility
- **WHEN** two episodes run with the same seed and actions
- **THEN** every state matches step by step

### Requirement: Encoding
The encoding SHALL be a fixed-size vector of finite values in the car's frame: speed, heading error to the track tangent, lateral offset, current steering, and the track's curvature and lateral position at several distances ahead.

#### Scenario: Fixed-size encoding
- **WHEN** any reachable state is encoded
- **THEN** the vector has the declared length and only finite values
