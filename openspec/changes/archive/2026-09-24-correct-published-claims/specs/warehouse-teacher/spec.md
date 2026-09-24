## MODIFIED Requirements

### Requirement: Determinism, tie-breaking and cost
The teacher SHALL be deterministic, SHALL break ties with a root-only preference whose spread is below one timestep of path length, and SHALL report its cost as the number of search nodes expanded plus the number of predicted trajectory steps of the other robots. The window length SHALL be configurable, and a longer window MUST NOT cost less.

#### Scenario: Same state, same answer
- **WHEN** the teacher is queried twice on the same state
- **THEN** scores and cost are identical
