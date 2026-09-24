# Spec Delta

## ADDED Requirements

### Requirement: Quadruped random pushes switch
On the quadruped, the page SHALL offer a switch for the seeded random pushes, on by default. Turning it off SHALL drop the remaining pushes of the current episode and schedule none in later episodes; turning it on SHALL restore the pushes still due from the current time. Visitor pushes SHALL keep working either way, and no experiment SHALL be affected.

#### Scenario: Pushes off
- **WHEN** the visitor turns random pushes off during an episode
- **THEN** no further seeded push hits the robot in that episode or in the next ones
