# Spec Delta

## Purpose

Provides the single static demo page that makes the System One / System Two pattern visible: who decides each move, how confident System One is, how escalation evolves during training, and where each condition sits on the cost–quality frontier.

## ADDED Requirements

### Requirement: Static page
The demo SHALL be a static site with no server-side logic, buildable with one command, and usable on desktop and on a phone-width screen without horizontal scrolling.

#### Scenario: Build
- **WHEN** the build command runs
- **THEN** it produces a directory of static files that works when served by any static file server

### Requirement: Pretrained weights
The page SHALL ship the pretrained Snake weights and load them on request, so that a visitor can watch a trained hybrid without training.

#### Scenario: Load pretrained
- **WHEN** the visitor chooses to load the pretrained weights
- **THEN** the live game uses them from the next decision and the page shows the model size and parameter count

### Requirement: Live game with decision indicator
The page SHALL render the Snake game at a selectable speed with the hybrid playing, and SHALL show for every move who decided it using three distinct, labeled states: System One, System One stopped by the guard, System Two on low confidence. Running totals of each state and the mean cost per move SHALL be visible.

#### Scenario: Indicator
- **WHEN** a move is escalated because the guard rejected System One's proposal
- **THEN** the indicator shows the guard state for that move and the guard counter increases

#### Scenario: New episode
- **WHEN** an episode ends
- **THEN** the page records its score and starts a new episode on the next seed

### Requirement: Probability bars with threshold
For every decision the page SHALL show one bar per action with System One's probability, highlight the chosen action and draw the current confidence threshold.

#### Scenario: Bars match the policy
- **WHEN** System One decides
- **THEN** the bar lengths equal the policy probabilities and sum to the full scale

### Requirement: Live training curves
During training the page SHALL plot, per iteration, the escalation rate (total and guard), the mean episode score and the validation agreement, updating as progress arrives.

#### Scenario: Curve update
- **WHEN** a progress entry arrives
- **THEN** each curve gains one point without reloading the page

### Requirement: Controls
The page SHALL provide controls for: start and stop training, load pretrained weights, confidence threshold (0.5–0.99), guard on/off, game speed, and seed. Changing the threshold or the guard MUST affect the next decision of the live game.

#### Scenario: Threshold change
- **WHEN** the visitor raises the threshold
- **THEN** the threshold line on the bars moves and subsequent decisions escalate according to the new value

### Requirement: Results panel
The page SHALL render the cost–quality frontier from the published evaluation report: mean cost per move on a logarithmic x axis, mean score on the y axis, one point per condition, with guarded and unguarded hybrids and System Two visually distinguished and labeled.

#### Scenario: Frontier
- **WHEN** the results panel is shown
- **THEN** every condition of the published report appears as a labeled point at its cost and score

### Requirement: Video export
The visitor SHALL be able to record the game view and download it as a video file.

#### Scenario: Recording
- **WHEN** the visitor starts and then stops a recording
- **THEN** a video file of the game view between the two moments is offered for download
