# Spec Delta

## ADDED Requirements

### Requirement: Planner ghost for racing
When the racing game is selected, the page SHALL show a second, semi-transparent car driven by the planner alone on the same track and seed, advanced one decision for each decision of the live car and reset with it. The page SHALL show the progress gap between the live car and the ghost. The ghost's compute MUST NOT be counted in the live cost readout.

#### Scenario: Gap readout
- **WHEN** the live car and the ghost have both driven for some time
- **THEN** the page shows how many metres the live car is ahead of or behind the ghost

### Requirement: Racing telemetry
When the racing game is selected, the page SHALL plot the live car's speed, steering and pedal over the last 20 seconds of driving, marking the decisions escalated to the planner.

#### Scenario: Escalation marks
- **WHEN** a decision is escalated to the planner
- **THEN** the telemetry shows a mark at that decision

### Requirement: Trail modes, laps and camera
When the racing game is selected, the visitor SHALL be able to switch the trail colouring between "who decided" and "speed" (with braking points marked), and the camera between following the car and showing the whole track. The page SHALL show the current, last and best lap times.

#### Scenario: Completed lap
- **WHEN** the live car completes a lap
- **THEN** the last-lap time is updated and the best-lap time is the minimum so far

#### Scenario: Full-track camera
- **WHEN** the visitor switches to the full-track view
- **THEN** the whole track is visible and both cars are drawn on it
