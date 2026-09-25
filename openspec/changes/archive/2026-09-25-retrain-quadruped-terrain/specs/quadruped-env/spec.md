## ADDED Requirements

### Requirement: Varied terrain
The terrain configuration SHALL offer a `varied` kind that draws, from its own seeded stream, one of flat, hills, branches and mixed for each episode, then generates that terrain as for the drawn kind.

#### Scenario: Every kind appears
- **WHEN** 40 consecutive seeds are drawn with the varied kind
- **THEN** each of the four kinds occurs, and the same seed always draws the same kind and terrain
