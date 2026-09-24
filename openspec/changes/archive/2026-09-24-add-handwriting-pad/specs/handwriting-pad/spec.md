# Spec Delta

## Purpose

Provides the browser page where a visitor writes uppercase letters one at a time on a round touchpad, and sees both recognisers' answers, costs and the network's forward pass.

## ADDED Requirements

### Requirement: Stroke capture
The page SHALL capture strokes from finger, pen or mouse with pointer events on a round pad, without scrolling or zooming the page while drawing. Only the first active pointer SHALL draw, and ink SHALL be drawn as it is written.

#### Scenario: Touch does not scroll
- **WHEN** a visitor draws on the pad on a touch device
- **THEN** the page does not scroll or zoom, and the ink follows the finger

### Requirement: Commit rule
A letter SHALL be recognised 600 ms after the last pointer-up. A stroke that begins before then SHALL belong to the same letter.

#### Scenario: Multistroke letter
- **WHEN** a visitor draws the three strokes of an "H", each within 600 ms of the previous pointer-up
- **THEN** a single letter is recognised from all three strokes

### Requirement: Results and correction
After each recognition, the page SHALL append the MLP's top letter to a text display and show the top-3 alternatives as buttons that replace it. It SHALL show:
- the MLP's top-5 probabilities;
- $P's top-3 letters;
- whether the two agree;
- both costs per recognition, in operations and in milliseconds measured in the browser.

Space, backspace and clear controls SHALL be provided.

#### Scenario: Correct a letter
- **WHEN** the visitor taps the second alternative
- **THEN** the last letter in the display is replaced by that alternative

### Requirement: Network view and data notice
The page SHALL show the MLP's real forward pass for the last recognised letter in the 3D network view. It SHALL credit the dataset (UJI Pen Characters v2, CC BY 4.0), and SHALL state that ink is processed only in the browser. The games page and the handwriting page SHALL link to each other.

#### Scenario: Offline processing
- **WHEN** a letter is recognised
- **THEN** no network request carries the ink or the result
