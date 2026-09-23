# snake-env Specification

## Purpose
Provides the headless, deterministic Snake game used as the first testbed for the System One / System Two pattern, with an egocentric encoding that shows the model a real portion of the map.

## Requirements

### Requirement: Game rules
The game SHALL be played on a 20x20 grid with one food item at a time. The snake MUST die if its head enters a wall or its own body; eating the food MUST grow the snake by one cell and spawn new food on a free cell. The episode MUST also end when the snake exceeds a configurable limit of consecutive moves without eating, or when the grid is full.

#### Scenario: Wall collision
- **WHEN** the head moves outside the grid
- **THEN** the episode ends as a wall death

#### Scenario: Moving into the cell just vacated by the tail
- **WHEN** the head enters the cell occupied by the tail on a step in which the snake does not eat
- **THEN** the move is valid and the episode continues

#### Scenario: Starvation limit
- **WHEN** the snake makes more consecutive moves without eating than the configured limit
- **THEN** the episode ends as a starvation death

### Requirement: Relative actions
There SHALL be three actions, relative to the current heading: straight, left, right. All three MUST be legal in every non-terminal state, even if they lead to death.

#### Scenario: Left turn
- **WHEN** the snake heads north and chooses "left"
- **THEN** the new heading is west and the head advances one cell west

### Requirement: Determinism given the seed
Given the same seed and the same sequence of actions, the game SHALL produce exactly the same sequence of states, including food positions.

#### Scenario: Reproducibility
- **WHEN** two episodes are run with the same seed and the same actions
- **THEN** states and scores match step by step

### Requirement: Egocentric encoding for System One
The encoding SHALL contain a 7x7 window centered on the head and rotated according to the current heading, with one category per cell (empty, body, wall, food), plus the relative direction of the food and the normalized length, for about 200 values in total. Cells outside the grid MUST be encoded as wall.

#### Scenario: Out-of-grid wall
- **WHEN** the head is adjacent to the grid border
- **THEN** the window cells beyond the border are encoded as wall

#### Scenario: Rotation invariance
- **WHEN** two states differ only by a 90-degree rotation of the whole scene
- **THEN** their encodings are identical

### Requirement: Episode metrics
At the end of every episode the game SHALL report final length, number of moves, end reason (wall, body, starvation, win) and average moves per food.

#### Scenario: End-of-episode summary
- **WHEN** an episode ends
- **THEN** the summary contains length, moves, end reason and moves per food
