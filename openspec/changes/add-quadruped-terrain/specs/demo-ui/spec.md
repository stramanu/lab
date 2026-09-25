## ADDED Requirements

### Requirement: Quadruped terrain selector
The quadruped's controls SHALL offer a terrain selector (flat, hills, branches, mixed), flat by default and applied from the next episode, and the 3D view SHALL draw the hills and branches of the episode. The page SHALL say that the network was trained on flat ground only.

#### Scenario: Hills
- **WHEN** the visitor selects hills
- **THEN** the next episode is played on seeded hills, drawn in the 3D view, with the same network and planner
