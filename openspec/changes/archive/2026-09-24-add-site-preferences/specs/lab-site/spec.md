# Spec Delta

## ADDED Requirements

### Requirement: Persistent theme
The visitor's light/dark choice SHALL be stored in the browser and applied on every page of the lab before the first paint. When storage is unavailable, the page SHALL follow the system theme and keep working.

#### Scenario: Choice remembered across pages
- **WHEN** a visitor switches to the dark theme on the lab home and then opens the handwriting page
- **THEN** the handwriting page opens in the dark theme, without first showing the light one
