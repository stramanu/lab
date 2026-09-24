## MODIFIED Requirements

### Requirement: Fixed-capacity dataset with deduplication
The dataset SHALL have a configurable maximum capacity, replace the oldest examples when full and discard a state whose deduplication hash matches one already present. The hash SHALL be computed on the encoding with each value clamped to [0, 1] and quantized to 1/255, so distinct states whose encodings differ only outside [0, 1] or below that resolution count as duplicates; the write-ups SHALL report the measured rate of such false duplicates.

#### Scenario: Duplicate state
- **WHEN** a state with the same encoding as one already present is added
- **THEN** the dataset size does not increase
