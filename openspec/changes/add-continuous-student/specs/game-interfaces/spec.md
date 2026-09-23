# Spec Delta

## ADDED Requirements

### Requirement: Continuous-action contract
An environment MAY additionally support continuous actions by declaring an action dimension, per-dimension bounds and a step that takes a continuous action vector. A teacher for such an environment MAY return, besides its per-action scores, the continuous action vector corresponding to its chosen action. Discrete and continuous steps of the same environment MUST share the same physics.

#### Scenario: Discrete action as a continuous one
- **WHEN** an environment steps with a discrete action and a copy steps with that action's continuous equivalent
- **THEN** both reach the same state
