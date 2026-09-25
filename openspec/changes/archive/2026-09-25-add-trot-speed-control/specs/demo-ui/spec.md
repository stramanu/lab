## ADDED Requirements

### Requirement: Quadruped trot speed
The quadruped's controls SHALL offer a trot speed slider (0.2–0.7 m/s, default 0.4, the training value) that sets the base controller's commanded speed live, for the robot, the planner's rollouts and the guard, and the page SHALL say that the network does not see this setting.

#### Scenario: Faster trot
- **WHEN** the visitor sets the trot speed to 0.7 m/s
- **THEN** the robot walks faster from the next control step, and the planner plans with the same speed
