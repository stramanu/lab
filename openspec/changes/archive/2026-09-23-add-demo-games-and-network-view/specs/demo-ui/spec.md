# Spec Delta

## MODIFIED Requirements

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

### Requirement: Results panel
The page SHALL render the cost–quality frontier of the selected game from its published multi-run study: mean cost per move on a logarithmic x axis, mean score on the y axis, one point per condition with a 95% interval error bar on the score, with guarded and unguarded hybrids, System Two and baselines visually distinguished and labeled. The panel MUST state the split and the number of runs.

#### Scenario: Frontier
- **WHEN** the results panel is shown for a game
- **THEN** every condition of that game's study appears as a labeled point at its mean cost and mean score, with its score interval

## ADDED Requirements

### Requirement: Game selector
The page SHALL let the visitor switch between the games of the shared game registry that have published demo data. Switching MUST reset the live game, the counters and the curves, and load that game's planner, guard, action names, views and results.

#### Scenario: Switch to the lander
- **WHEN** the visitor selects the lander
- **THEN** the board shows the lander, the bars show four actions, and the frontier shows the lander study

### Requirement: 3D network view
The page SHALL show a 3D view of System One computing its current decision. It MUST use the real activations of the forward pass behind the displayed decision: inputs laid out meaningfully per game, hidden neurons with brightness proportional to their activation, and output nodes with the action probabilities and the color of who decided. It SHALL draw, for each layer transition, only the connections with the largest absolute contribution (weight × source activation), colored by sign. The view MUST be orbitable, MUST stop rendering while off-screen, and MUST degrade to a message when WebGL is unavailable.

#### Scenario: View matches the decision
- **WHEN** System One makes a decision
- **THEN** the output nodes show the same probabilities as the probability bars, and the drawn connections are the largest-contribution ones for that forward pass

#### Scenario: No WebGL
- **WHEN** the browser cannot create a WebGL context
- **THEN** the view shows an explanatory message and the rest of the page keeps working
