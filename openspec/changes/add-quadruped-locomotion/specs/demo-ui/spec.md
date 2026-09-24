# Spec Delta

## ADDED Requirements

### Requirement: 3D board for the quadruped
The page SHALL render the quadruped in 3D (three.js, loaded lazily) on its own canvas over the board: the trunk colored by who decided the last action, footprints colored the same way at every touchdown, pushes as arrows, and a camera following the robot. The robot's pose SHALL be interpolated between decisions, so motion stays continuous when decisions are slow. The physics engine SHALL load only when the quadruped is selected, and in-tab training SHALL be disabled for it with an explanation.

#### Scenario: Physics loads on demand
- **WHEN** a visitor opens a game other than the quadruped
- **THEN** the physics engine is not downloaded

### Requirement: Planner off the main thread
When the quadruped's planner decides, the page SHALL run it in a worker on a snapshot of the live state, keep animating while it runs, and apply its answer to the state it was asked about. Answers for a state that no longer exists (new episode, new game) SHALL be ignored.

#### Scenario: Smooth while the planner thinks
- **WHEN** every decision escalates to the planner
- **THEN** the page keeps rendering frames while each planner call runs

### Requirement: Visitor pushes
The visitor SHALL be able to push the quadruped by dragging on the 3D view: a horizontal impulse along the drag, proportional to its length up to 14 N·s, applied to the live robot and shown as an arrow, with a preview while dragging. Visitor pushes SHALL be counted separately from the seeded ones, and SHALL not affect any experiment.

#### Scenario: Drag to push
- **WHEN** the visitor drags across the robot and releases
- **THEN** the robot receives an impulse in the drag direction and the push counter increases
