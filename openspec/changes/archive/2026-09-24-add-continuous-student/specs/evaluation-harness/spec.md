# Spec Delta

## ADDED Requirements

### Requirement: Continuous agreement
For continuous games, evaluation SHALL measure agreement with the game's declared continuous agreement rule, applied between the student's action and the planner's continuous action. For the racing game, the rule is steering within 0.03 rad and the same pedal sign. Calibration (ECE and reliability data) SHALL use the ensemble's confidence against this agreement, and H4 SHALL be evaluated with it at the unchanged threshold and target.

#### Scenario: Agreement above threshold for racing
- **WHEN** a continuous hybrid is evaluated
- **THEN** the report shows the share of System One moves whose action agrees with the planner's under the racing rule
