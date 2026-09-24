## MODIFIED Requirements

### Requirement: Background training
Training SHALL run in a background worker for the game currently selected in the page, using the same three-phase protocol and the same game-specific defaults as the offline pipeline (with the guard enabled), so that the page stays responsive: the game keeps rendering while training runs. A game whose training takes hours (the quadruped) SHALL NOT offer in-tab training, and the page SHALL say that it is trained offline.

#### Scenario: Responsive page during training
- **WHEN** training is running
- **THEN** the game view keeps animating and the controls keep responding

#### Scenario: Lander training
- **WHEN** training is started with the lander selected
- **THEN** the worker trains a lander model with the lander's registry defaults and streams lander progress

#### Scenario: Quadruped
- **WHEN** the quadruped is selected
- **THEN** the training button is disabled and the page says that this game is trained offline
