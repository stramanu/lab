# Spec Delta

## ADDED Requirements

### Requirement: Guard contract
A guard SHALL check a single proposed action in a given state and return whether the action is accepted and the cost of the check in integer compute units. A guard MUST be deterministic, MUST NOT modify the state it checks and MUST be cheaper on average than a full teacher query.

#### Scenario: Deterministic check
- **WHEN** the same action is checked twice in the same state
- **THEN** the verdict and cost are identical and the state is unchanged
