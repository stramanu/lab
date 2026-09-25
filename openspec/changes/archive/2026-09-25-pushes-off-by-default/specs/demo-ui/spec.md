## MODIFIED Requirements

### Requirement: Quadruped random pushes switch
On the quadruped, the page SHALL offer a switch for the seeded random pushes, off by default, and SHALL say that the experiments always push. Turning it on SHALL restore the pushes still due from the current time and schedule them in later episodes; turning it off SHALL drop the remaining pushes of the current episode and schedule none in later episodes. Visitor pushes SHALL keep working either way, and no experiment SHALL be affected.

#### Scenario: Pushes off
- **WHEN** the visitor opens the quadruped
- **THEN** no seeded push is applied until the switch is turned on, and dragging on the robot still pushes it
