# Spec Delta

## ADDED Requirements

### Requirement: Continuous actions
The racing environment SHALL accept a continuous action of two values: the steering target in [−0.30, 0.30] rad and the pedal in [−1, 1], where positive values scale the gas acceleration and negative values scale the braking deceleration. Out-of-range values MUST be clamped. Each discrete command SHALL map to the continuous action it produces (the resulting steering target and a pedal of +1 or −1).

#### Scenario: Pedal scaling
- **WHEN** the car at speed steps with pedal −0.5 and a copy steps with pedal −1
- **THEN** the first loses about half as much speed to braking as the second

#### Scenario: Equivalence with commands
- **WHEN** one copy steps with a discrete command and another with its continuous equivalent
- **THEN** both reach the same state
