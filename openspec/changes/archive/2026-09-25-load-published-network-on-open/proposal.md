# Proposal

## Why

The System One page opened every game with random weights, and the published network loaded only when a
visitor pressed "Load pretrained". Visitors expect to see the trained network, and the quadruped cannot be
trained in the tab at all.

## What Changes

- Each game opens with its published network (run 1 of its study). "Load pretrained" restores it, and
  "Train in this tab" still starts from random weights.
- "How it works" and the write-up say so.

## Capabilities

### New Capabilities

### Modified Capabilities
- `demo-ui`: pretrained weights are loaded on open.

## Impact

- **Code:** `web/main.ts`, the System One page, `docs/systemone.md`.
- **Results:** no experiment result changes.
