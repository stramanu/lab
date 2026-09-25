## MODIFIED Requirements

### Requirement: Planner off the main thread
When the quadruped's planner decides, the page SHALL run it off the main thread on a snapshot of the live state, splitting its candidates across several workers and combining their values into the same answer the planner gives in place, keep animating while it runs, and apply its answer to the state it was asked about. Answers for a state that no longer exists (new episode, new game) SHALL be ignored.

#### Scenario: Smooth while the planner thinks
- **WHEN** every decision escalates to the planner
- **THEN** the page keeps rendering frames while each planner call runs

#### Scenario: Same answer across workers
- **WHEN** the planner's candidates are evaluated separately and combined
- **THEN** the scores, the chosen action and the cost are identical to the planner's in place

### Requirement: 3D board for the quadruped
The page SHALL render the quadruped in 3D (three.js, loaded lazily) on its own canvas over the board: the trunk colored by who decided the last action, footprints colored the same way at every touchdown, pushes as arrows, and a camera following the robot. Between decisions, the view SHALL play back the robot's poses recorded every 20 ms of simulated time, so the real gait stays smooth when decisions are slow. The physics engine SHALL load only when the quadruped is selected, and in-tab training SHALL be disabled for it with an explanation.

#### Scenario: Physics loads on demand
- **WHEN** a visitor opens a game other than the quadruped
- **THEN** the physics engine is not downloaded
