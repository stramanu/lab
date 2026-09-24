# evaluation-harness Specification

## Purpose
Reproducibly evaluates the four experimental conditions on fixed seeds disjoint from training, producing the numbers needed to confirm or reject hypotheses H1–H4.

## Requirements

### Requirement: Fixed and disjoint evaluation seeds
Evaluation SHALL use fixed, published seed splits that are pairwise disjoint: a **test** split of 200 seeds (1–200) reserved for final results, a **dev** split of 200 seeds (10,001–10,200) for design decisions and ablations, and training seeds from 1,000,000 upward. The evaluation command MUST default to the dev split and MUST refuse the test split unless it is requested explicitly.

#### Scenario: Seed disjointness
- **WHEN** the training, dev and test seed sets are compared
- **THEN** every pairwise intersection is empty

#### Scenario: Test split is opt-in
- **WHEN** evaluation runs without an explicit split
- **THEN** it uses the dev split and the report records the split name

### Requirement: Experimental conditions
Evaluation SHALL run the conditions Random, System Two alone (at one or more levels of the cost knob), System One alone, Hybrid without guard at thresholds 0.5 / 0.7 / 0.8 / 0.9 / 0.95, and, when the game provides a guard, Hybrid with guard at the same thresholds plus a guard-only condition (threshold 0), all on the same seeds.

#### Scenario: Full run
- **WHEN** evaluation is launched with trained weights for a game that provides a guard
- **THEN** the report contains a result for each condition and threshold, with and without guard, and for the guard-only condition

### Requirement: Per-condition metrics
For every condition the report SHALL contain: mean score with 95% confidence interval, median, distribution of end reasons, mean cost per move in compute units, mean time per move in microseconds, number of System Two calls, percentage of escalated moves split by reason (confidence, guard) and agreement with the teacher (for the hybrid), the guard's share of the total cost (for guarded conditions), ECE and reliability diagram data (for conditions with a student).

#### Scenario: Agreement above threshold
- **WHEN** the hybrid is evaluated
- **THEN** the report shows the agreement rate with the teacher computed only over decisions above threshold

#### Scenario: Escalation breakdown
- **WHEN** a guarded hybrid is evaluated
- **THEN** the confidence-triggered and guard-triggered escalation rates sum to the total escalation rate

### Requirement: Hypothesis verification
The report SHALL include, for H1–H4, the measured value, the declared target and the outcome (confirmed or not), without altering targets based on the results. H2 SHALL be evaluated over every hybrid variant (with and without guard) and report which one is best.

#### Scenario: H2 outcome
- **WHEN** the report is generated
- **THEN** for H2 it reports the hybrid/System Two score ratio and the cost-per-move ratio of the best variant, compared with the 90% and 10x targets

### Requirement: Machine- and human-readable report
Evaluation SHALL write a complete JSON report and print a human-readable table in the terminal, including parameter count, weight size in KB and hardware characteristics.

#### Scenario: CLI output
- **WHEN** evaluation ends
- **THEN** a JSON report file exists and the terminal shows a table with one row per condition

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

### Requirement: Continuous agreement
For continuous games, evaluation SHALL measure agreement with the game's declared continuous agreement rule, applied between the student's action and the planner's continuous action. For the racing game, the rule is steering within 0.03 rad and the same pedal sign. Calibration (ECE and reliability data) SHALL use the ensemble's confidence against this agreement, and H4 SHALL be evaluated with it at the unchanged threshold and target.

#### Scenario: Agreement above threshold for racing
- **WHEN** a continuous hybrid is evaluated
- **THEN** the report shows the share of System One moves whose action agrees with the planner's under the racing rule
