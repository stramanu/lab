## ADDED Requirements

### Requirement: Fine-tuning from initial weights
The continuous pipeline SHALL accept an optional initial ensemble, of the same architecture, and start its bootstrap training from those weights instead of random ones; without it, training SHALL be unchanged.

#### Scenario: Starts from the given weights
- **WHEN** a pipeline is created with an initial ensemble
- **THEN** before any training its ensemble's actions equal those of the initial ensemble
