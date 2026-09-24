# Spec Delta

## MODIFIED Requirements

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
