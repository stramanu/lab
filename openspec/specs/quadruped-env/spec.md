# quadruped-env Specification

## Purpose
Provides the quadruped environment: a 12-joint robot in deterministic 3D rigid-body physics that walks forward while seeded pushes hit it, with continuous decisions at 10 Hz, falls, score and a proprioceptive observation.

## Requirements

### Requirement: Deterministic physics
The environment SHALL simulate the robot with the pinned deterministic Rapier build at dt = 5 ms, and SHALL be deterministic given its seed. A snapshot of the environment, once restored, SHALL continue identically to the original.

#### Scenario: Same seed, same episode
- **WHEN** the same episode is run twice with the same seed and actions
- **THEN** every trunk pose and the score are bitwise identical

#### Scenario: Snapshot continuation
- **WHEN** a snapshot is taken mid-episode, restored, and both copies are stepped with the same actions
- **THEN** they remain bitwise identical

### Requirement: Asynchronous initialisation
The game definition SHALL expose a one-time asynchronous initialisation of the physics engine. Scripts, evaluation workers, the training worker and the demo SHALL await it before creating an environment.

#### Scenario: Environment before initialisation
- **WHEN** an environment is created before the initialisation has completed
- **THEN** it fails with an error that names the missing initialisation

### Requirement: Episode, pushes, falls and score
An episode SHALL last 20 s of simulated time with one decision every 100 ms (200 decisions). The seed SHALL set the ground friction, drawn from [0.7, 1.1]. Horizontal pushes SHALL be applied to the trunk at seeded times and directions. The episode SHALL end early when the trunk centre falls below 0.12 m, or when the trunk's up axis tilts more than 60° from vertical. The score SHALL be the trunk's forward displacement along +x in metres.

#### Scenario: Fall ends the episode
- **WHEN** the trunk tilts beyond 60°
- **THEN** the episode is done and the score is the displacement reached so far

#### Scenario: Seeded pushes
- **WHEN** two episodes use the same seed
- **THEN** their pushes have the same times, directions and magnitudes

### Requirement: Continuous action and observation
An action SHALL be a 4-dimensional vector in [−1, 1]⁴, modulating the base controller's forward and lateral foot placement, body height and step frequency. The zero action SHALL reproduce the base controller exactly. The observation SHALL be a fixed-size vector of 46 finite values: trunk height, the gravity direction in the trunk frame, the heading, trunk linear and angular velocity, 12 joint angles and velocities, 4 foot contacts, the gait phase and the last action.

#### Scenario: Zero action is the base controller
- **WHEN** an episode is played with the zero action at every decision
- **THEN** it is identical to an episode played by the base controller

#### Scenario: Observation size
- **WHEN** any state is encoded
- **THEN** the observation has 46 finite values

### Requirement: Seeded terrain
The environment SHALL accept a terrain configuration with the kinds `flat` (default), `hills`, `branches` and `mixed`, draw the terrain from the episode seed through its own random stream, start every episode on flat ground, and measure the trunk height (input and fall check) from the hills under the trunk and foot contacts from the ground surface under each foot. Flat terrain SHALL add no collider and leave every episode bitwise identical to the environment without terrain.

#### Scenario: Flat is unchanged
- **WHEN** an episode is played on flat terrain
- **THEN** its trajectory, encodings and score are bitwise identical to those of the environment without terrain support

#### Scenario: Physics matches the terrain description
- **WHEN** the ground is probed with a vertical ray at points of a hills-and-branches episode
- **THEN** the hit height matches the analytic surface within 1 cm on the hills and 3 mm on the branches

#### Scenario: Snapshots carry the terrain
- **WHEN** an episode on terrain is restored from a snapshot and both copies play the same actions
- **THEN** they stay bitwise identical

### Requirement: Varied terrain
The terrain configuration SHALL offer a `varied` kind that draws, from its own seeded stream, one of flat, hills, branches and mixed for each episode, then generates that terrain as for the drawn kind.

#### Scenario: Every kind appears
- **WHEN** 40 consecutive seeds are drawn with the varied kind
- **THEN** each of the four kinds occurs, and the same seed always draws the same kind and terrain
