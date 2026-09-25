## MODIFIED Requirements

### Requirement: Fixed-capacity dataset with deduplication
The dataset SHALL have a configurable maximum capacity, replace the oldest examples when full and discard a state only if an identical encoding (compared as float32) is already present. States whose encodings differ in any value SHALL both be kept.

#### Scenario: Duplicate state
- **WHEN** a state with the same encoding as one already present is added
- **THEN** the dataset size does not increase

#### Scenario: Near-identical states
- **WHEN** two states whose encodings differ only below 1/255, or only in values outside [0, 1], are added
- **THEN** both are kept
