## ADDED Requirements

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
