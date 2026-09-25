# applied-experiments Specification

## Purpose
Defines the rules of the lab's applied side: experiments that use established libraries, GPUs and models of real robots, under the same method as the from-scratch experiments, with their tools, hardware and licences stated.

## Requirements

### Requirement: Applied side of the lab
Experiments on the applied side MAY use established libraries, GPUs and third-party robot models, and SHALL state this on their page and in their write-up. They SHALL follow the lab's method: targets and go/no-go criteria fixed in an OpenSpec change before any measurement, held-out evaluation seeds, repeated runs for final results, and negative results reported like positive ones. Third-party models SHALL ship with their licence notices, and the hardware used (GPU model included) SHALL be recorded with every result.

#### Scenario: A page on the applied side
- **WHEN** a visitor opens an applied experiment's page
- **THEN** the page states which libraries, hardware and third-party models the experiment relies on, and links their licences
