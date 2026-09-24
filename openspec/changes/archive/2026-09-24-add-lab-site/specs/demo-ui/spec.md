# Spec Delta

## ADDED Requirements

### Requirement: How it works
The System One page SHALL explain, with a diagram and text:
- the planner (System Two), the network (System One), the confidence threshold, the guard and escalation;
- how the network learns from the planner;
- what compute units are;
- what the decision shares mean, including why System One's share grows and System Two's shrinks as the network trains, and how the threshold changes them.

#### Scenario: Shares explained
- **WHEN** a visitor reads the explainer
- **THEN** it states over how many moves the shares are measured, and why an untrained network hands almost every decision to the planner

### Requirement: Per-game explanation
For the selected game, the page SHALL show:
- what happens and how it is scored;
- the network's architecture;
- every input group with its meaning and encoding;
- the outputs;
- what the planner and the guard do;
- the published result.

The content SHALL agree with the game's encoding, planner and guard.

#### Scenario: Inputs match the encoding
- **WHEN** the explanation of a game lists its input groups
- **THEN** their sizes add up to the game's encoding size

### Requirement: Visitor wind on the lander
On the lander, the page SHALL offer a control that adds a constant wind (−0.8 to +0.8 m/s²) to the seeded wind, live, with a reset to calm. The added wind SHALL be 0 in every experiment.

#### Scenario: Wind changes the descent
- **WHEN** the visitor sets the wind to +0.6 m/s²
- **THEN** the wind shown on the board and fed to the network and the planner includes the added 0.6 m/s²
