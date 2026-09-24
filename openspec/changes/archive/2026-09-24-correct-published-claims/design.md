# Design

## Context

This is a correction pass over published claims, not a new capability. Two decisions need a record.

## Decisions

- **Deduplication stays as implemented.** Fixing the hash would change the training data of Snake, the
  lander and the warehouse, and so every published number of those studies.
  - Measured on planner-driven training episodes, the false-duplicate rate is small: 0.3% for Snake,
    0.1% for the lander and 4.9% for the warehouse.
  - It is documented in the code, in the specification and in EXPERIMENTS.md (decision 33).
  - Fixing it would need re-running the three studies, which is left to the author.
- **H4 across runs.** Agreement above the threshold is undefined in a run where System One never acts
  there.
  - The across-run value is now the mean of the runs where it is defined, and the report names how
    many runs that is.
  - A run where System One never acts still counts as not confirming H4.
  - Previously, one undefined run made the whole mean undefined, and the report wrongly said that
    System One never acted.
