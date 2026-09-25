## ADDED Requirements

### Requirement: Optional height scan
The environment SHALL offer an optional height-scan sensor, off by default: 77 values (11 × 7 points, 0.1 m apart, from 0.2 m behind to 0.8 m ahead of the trunk and ±0.3 m across, in the trunk's heading frame), each the ground's height relative to the trunk minus the nominal standing height, in units of 0.1 m, appended after the 46 proprioceptive values. With the sensor off, the encoding SHALL be unchanged.

#### Scenario: Flat and standing
- **WHEN** the robot stands on flat ground at the start of an episode with the sensor on
- **THEN** the encoding has 123 values and every scan value is close to zero

#### Scenario: A hill ahead
- **WHEN** a hill rises in front of the robot
- **THEN** the scan values for the points ahead show the ground higher than under the trunk
