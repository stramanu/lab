# Proposal

## Why

Visitors want to change how fast the quadruped trots while it walks. It is also another test outside the
training distribution: the network was trained at 0.4 m/s, and its inputs do not include the commanded
speed.

## What Changes

- A "Trot speed" slider in the quadruped controls (0.2–0.7 m/s, default 0.4). It sets the base
  controller's commanded speed live. The planner's rollouts, in the page's workers, and the guard use the
  same value.
- The page says that the network sees neither the terrain nor the trot speed.

## Capabilities

### New Capabilities

### Modified Capabilities
- `demo-ui`: trot speed control.

## Impact

- **Code:** `web/quadruped-controls.ts`, the System One page and its styles.
- **Results:** no experiment result changes.
