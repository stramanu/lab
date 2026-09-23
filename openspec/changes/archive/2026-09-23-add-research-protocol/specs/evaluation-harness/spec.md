# Spec Delta

## MODIFIED Requirements

### Requirement: Fixed and disjoint evaluation seeds
Evaluation SHALL use fixed, published seed splits that are pairwise disjoint: a **test** split of 200 seeds (1–200) reserved for final results, a **dev** split of 200 seeds (10,001–10,200) for design decisions and ablations, and training seeds from 1,000,000 upward. The evaluation command MUST default to the dev split and MUST refuse the test split unless it is requested explicitly.

#### Scenario: Seed disjointness
- **WHEN** the training, dev and test seed sets are compared
- **THEN** every pairwise intersection is empty

#### Scenario: Test split is opt-in
- **WHEN** evaluation runs without an explicit split
- **THEN** it uses the dev split and the report records the split name

## ADDED Requirements

### Requirement: Multi-seed results
A final study SHALL train each game with at least 5 different training seeds, evaluate each resulting model on the same split, and report for every condition the mean across runs with a 95% confidence interval from the t-distribution, together with every per-run value. Conditions that do not depend on the trained weights MAY be evaluated once and shared across runs.

#### Scenario: Aggregated report
- **WHEN** a study with 5 training seeds completes
- **THEN** the aggregated report lists, for each condition, 5 per-run means, their mean and a 95% t-interval

### Requirement: Hypotheses on aggregated results
In a multi-seed study, each hypothesis SHALL be judged on the across-run mean against its unchanged target, and the report SHALL also state in how many individual runs the hypothesis holds.

#### Scenario: Per-run tally
- **WHEN** H2 holds in 3 of 5 runs and fails on the mean
- **THEN** the report marks H2 as not confirmed and shows "3/5 runs"
