## MODIFIED Requirements

### Requirement: Pretrained weights
The page SHALL ship pretrained weights for every game it offers, load them when the game is opened, and restore them on request. For each game, the shipped weights MUST be run 1 of that game's published multi-run study (a choice fixed in advance, not the best run), and the page MUST say so. In-tab training SHALL start from random weights.

#### Scenario: Open a game
- **WHEN** the visitor opens a game
- **THEN** the live game uses its published weights as soon as they are loaded, and the page shows the model size, the parameter count and that the weights are run 1 of the study

#### Scenario: Load pretrained
- **WHEN** the visitor chooses to load the pretrained weights for the selected game after training in the tab
- **THEN** the live game uses them from the next decision
