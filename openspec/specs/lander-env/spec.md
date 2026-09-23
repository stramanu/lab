# lander-env Specification

## Purpose
Provides the headless, deterministic 2D lander game: continuous state, physics with gravity, inertia and wind, limited fuel, and a seeded landing site. It is the second testbed for the same System One / System Two pipeline.

## Requirements

### Requirement: Physics
The game SHALL simulate a rigid 2D ship with position, velocity, angle, angular velocity and fuel under constant gravity and a seeded horizontal wind, integrated with a fixed time step. Every decision SHALL be held for a fixed number of physics steps. The main engine MUST accelerate the ship along its own up axis, the side thrusters MUST change its angular velocity in opposite directions, and every firing action MUST consume fuel. With no fuel left, every action MUST behave as "none".

#### Scenario: Free fall
- **WHEN** the ship chooses "none" for one decision from rest, with zero wind
- **THEN** its vertical velocity increases in the downward direction by gravity × decision duration, within 1e-9

#### Scenario: Main engine against gravity
- **WHEN** the upright ship fires the main engine
- **THEN** its upward acceleration equals engine thrust minus gravity and its fuel decreases

#### Scenario: Empty tank
- **WHEN** the fuel is zero and the ship chooses the main engine
- **THEN** the step is identical to choosing "none"

### Requirement: Actions
There SHALL be four actions: none, main engine, left thruster, right thruster. All four MUST be legal in every non-terminal state.

#### Scenario: Legal actions
- **WHEN** the episode is running
- **THEN** all four actions are legal

### Requirement: Terrain, pad and wind from the seed
Each seed SHALL determine the terrain profile, the position of a flat landing pad, the starting position and velocity of the ship, and the wind strength. The pad MUST be flat and fully inside the world.

#### Scenario: Seeded world
- **WHEN** two episodes are reset with the same seed
- **THEN** terrain, pad, wind and starting state are identical, and they differ for a different seed

### Requirement: Landing and episode end
The episode SHALL end with a landing when the ship touches the pad with vertical and horizontal speed and tilt below the configured limits. It SHALL end with a crash on any other ground contact, when the ship leaves the side or top bounds, or when a time limit expires.

#### Scenario: Soft landing on the pad
- **WHEN** the ship touches the pad upright and slowly
- **THEN** the episode ends as a landing

#### Scenario: Hard landing
- **WHEN** the ship touches the pad faster than the vertical speed limit
- **THEN** the episode ends as a crash

#### Scenario: Off the pad
- **WHEN** the ship touches the terrain outside the pad
- **THEN** the episode ends as a crash

### Requirement: Determinism
Given the same seed and the same sequence of actions, the game SHALL produce exactly the same sequence of states.

#### Scenario: Reproducibility
- **WHEN** two episodes run with the same seed and actions
- **THEN** every state matches step by step

### Requirement: Encoding
The encoding SHALL be a fixed-size vector of 15 to 20 finite values: position relative to the pad, velocity, angle (as sine and cosine), angular velocity, fuel fraction, wind, and terrain height relative to the ship at a few points below it.

#### Scenario: Fixed-size encoding
- **WHEN** any reachable state is encoded
- **THEN** the vector has the declared length, between 15 and 20, and only finite values

### Requirement: Score and metrics
The episode score SHALL be 100 plus a bonus proportional to the remaining fuel fraction (at most 50) for a landing, and 0 otherwise. The summary SHALL report the end reason (landed, crashed, out of bounds, timeout), fuel used, impact speed and flight time.

#### Scenario: Summary
- **WHEN** an episode ends
- **THEN** the summary contains the end reason, fuel used, impact speed and flight time
