# demo-training Specification

## Purpose
Lets a visitor train System One from scratch inside their own browser tab without freezing the page, watching progress live and handing each new version of the weights to the running game.

## Requirements

### Requirement: Background training
Training SHALL run in a background worker using the same three-phase protocol and defaults as the offline pipeline (with the guard enabled), so that the page stays responsive: the game keeps rendering while training runs.

#### Scenario: Responsive page during training
- **WHEN** training is running
- **THEN** the game view keeps animating and the controls keep responding

### Requirement: Streamed progress
After every phase step (bootstrap, each escalation iteration, consolidation) the worker SHALL send the page the corresponding log entry, with the same fields as the offline training log.

#### Scenario: Progress entries
- **WHEN** an escalation iteration completes in the worker
- **THEN** the page receives a log entry with the escalation rate, the guard share, the mean score and the elapsed time

### Requirement: Weight hand-off
After every retraining the worker SHALL send the current weights and calibration temperature to the page in the serialized policy format, and the page SHALL use them for the next decisions of the live game.

#### Scenario: Live game improves
- **WHEN** the page receives new weights from the worker
- **THEN** the following System One decisions of the live game use the new weights without restarting the game

### Requirement: Cancellation
The visitor SHALL be able to stop training at any time; the worker MUST stop within one escalation iteration and the page MUST keep the last received weights.

#### Scenario: Stop
- **WHEN** the visitor stops training during the escalation loop
- **THEN** no further progress entries arrive after the current iteration and the live game keeps playing with the last weights

### Requirement: Reproducible in-tab training
With the same seed and configuration, training in the worker SHALL produce the same final weights as the offline pipeline.

#### Scenario: Same weights as Node
- **WHEN** the worker's training session and the offline pipeline run with the same reduced configuration
- **THEN** the exported weights are identical
