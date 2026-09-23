# Spec Delta

## MODIFIED Requirements

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
