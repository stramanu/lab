# Proposal

## Why

Visitors, and the author, want to see what the network does on its own, for example on terrain it was
never trained on, without the planner taking over.

## What Changes

- A "Planner" switch next to the guard, on by default. When it is off, System One decides every move
  alone. The confidence threshold and the guard are disabled while it is off, since both hand moves to the
  planner.

## Capabilities

### New Capabilities

### Modified Capabilities
- `demo-ui`: planner switch.

## Impact

- **Code:** `web/main.ts`, the System One page.
- **Results:** no experiment result changes.
