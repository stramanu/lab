# demo-ui Specification

## Purpose
Provides the single static demo page that makes the System One / System Two pattern visible: who decides each move, how confident System One is, how escalation evolves during training, and where each condition sits on the cost–quality frontier.

## Requirements

### Requirement: Static page
The demo SHALL be a static site with no server-side logic, buildable with one command, and usable on desktop and on a phone-width screen without horizontal scrolling.

#### Scenario: Build
- **WHEN** the build command runs
- **THEN** it produces a directory of static files that works when served by any static file server

### Requirement: Pretrained weights
The page SHALL ship pretrained weights for every game it offers and load them on request. For each game, the shipped weights MUST be run 1 of that game's published multi-run study (a choice fixed in advance, not the best run), and the page MUST say so.

#### Scenario: Load pretrained
- **WHEN** the visitor chooses to load the pretrained weights for the selected game
- **THEN** the live game uses them from the next decision and the page shows the model size, the parameter count and that the weights are run 1 of the study

### Requirement: Live game with decision indicator
The page SHALL render the selected game at a selectable speed with the hybrid playing, and SHALL show for every move who decided it using three distinct, labeled states: System One, System One stopped by the guard, System Two on low confidence. Running totals of each state and the mean cost per move SHALL be visible.

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
The page SHALL render the cost–quality frontier of the selected game from its published multi-run study: mean cost per move on a logarithmic x axis, mean score on the y axis, one point per condition with a 95% interval error bar on the score, with guarded and unguarded hybrids, System Two and baselines visually distinguished and labeled. The panel MUST state the split and the number of runs.

#### Scenario: Frontier
- **WHEN** the results panel is shown for a game
- **THEN** every condition of that game's study appears as a labeled point at its mean cost and mean score, with its score interval

### Requirement: Video export
The visitor SHALL be able to record the game view and download it as a video file.

#### Scenario: Recording
- **WHEN** the visitor starts and then stops a recording
- **THEN** a video file of the game view between the two moments is offered for download

### Requirement: Game selector
The page SHALL let the visitor switch between the games of the shared game registry that have published demo data. Switching MUST reset the live game, the counters and the curves, and load that game's planner, guard, action names, views and results.

#### Scenario: Switch to the lander
- **WHEN** the visitor selects the lander
- **THEN** the board shows the lander, the bars show four actions, and the frontier shows the lander study

### Requirement: 3D network view
The page SHALL show a 3D view of System One computing its current decision. It MUST use the real activations of the forward pass behind the displayed decision: inputs laid out meaningfully per game, hidden neurons with brightness proportional to their activation, and output nodes with the action probabilities and the color of who decided. Between the input and hidden layers it SHALL draw only the connections with the largest absolute contribution (weight × source activation), colored by sign. Into the output layer, when an output is chosen, it SHALL draw the largest contributions into the chosen output and into the runner-up; when no output is chosen, the largest contributions overall. The view MUST be orbitable, MUST stop rendering while off-screen, and MUST degrade to a message when WebGL is unavailable.

#### Scenario: View matches the decision
- **WHEN** System One makes a decision
- **THEN** the output nodes show the same probabilities as the probability bars, and the drawn connections are the largest-contribution ones for that forward pass

#### Scenario: The chosen output is explained
- **WHEN** one of many outputs is chosen
- **THEN** the drawn connections into the output layer end only at the chosen output and the runner-up, and at least one ends at the chosen output

#### Scenario: No WebGL
- **WHEN** the browser cannot create a WebGL context
- **THEN** the view shows an explanatory message and the rest of the page keeps working

### Requirement: Continuous game display
For continuous games, the page SHALL show System One's continuous action (one gauge per action dimension, with the planner's action when it was queried) and its confidence against the threshold, instead of per-action probability bars. The 3D network view SHALL show one ensemble member's forward pass, labeled as such.

#### Scenario: Racing gauges
- **WHEN** the racing game is selected and System One decides
- **THEN** the page shows its steering and pedal values and its confidence relative to the threshold

### Requirement: Planner ghost for racing
When the racing game is selected, the page SHALL show a second, semi-transparent car driven by the planner alone on the same track and seed, advanced one decision for each decision of the live car and reset with it. The page SHALL show the progress gap between the live car and the ghost. The ghost's compute MUST NOT be counted in the live cost readout.

#### Scenario: Gap readout
- **WHEN** the live car and the ghost have both driven for some time
- **THEN** the page shows how many metres the live car is ahead of or behind the ghost

### Requirement: Racing telemetry
When the racing game is selected, the page SHALL plot the live car's speed, steering and pedal over the last 20 seconds of driving, marking the decisions escalated to the planner.

#### Scenario: Escalation marks
- **WHEN** a decision is escalated to the planner
- **THEN** the telemetry shows a mark at that decision

### Requirement: Trail modes, laps and camera
When the racing game is selected, the visitor SHALL be able to switch the trail colouring between "who decided" and "speed" (with braking points marked), and the camera between following the car and showing the whole track. The page SHALL show the current, last and best lap times.

#### Scenario: Completed lap
- **WHEN** the live car completes a lap
- **THEN** the last-lap time is updated and the best-lap time is the minimum so far

#### Scenario: Full-track camera
- **WHEN** the visitor switches to the full-track view
- **THEN** the whole track is visible and both cars are drawn on it
