# Spec Delta

## ADDED Requirements

### Requirement: Continuous game display
For continuous games, the page SHALL show System One's continuous action (one gauge per action dimension, with the planner's action when it was queried) and its confidence against the threshold, instead of per-action probability bars. The 3D network view SHALL show one ensemble member's forward pass, labeled as such.

#### Scenario: Racing gauges
- **WHEN** the racing game is selected and System One decides
- **THEN** the page shows its steering and pedal values and its confidence relative to the threshold
