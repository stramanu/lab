## ADDED Requirements

### Requirement: Planner switch
The controls SHALL offer a planner switch, on by default. When it is off, System One SHALL decide every move alone, and the confidence threshold and the guard SHALL be disabled; turning it back on SHALL restore the hybrid with the current threshold and guard setting.

#### Scenario: Network alone
- **WHEN** the visitor turns the planner off
- **THEN** every following move is decided by System One and the planner's share stays at 0%
