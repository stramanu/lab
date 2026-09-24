# Proposal

## Why

With 26 outputs (the handwriting pad), the 3D view's global top-24 connections into the output layer spread over all letters, about one each, and are mostly negative contributions that push rejected letters down. The chosen letter, highlighted in green, often has no drawn connection at all, so the view does not show why it won. A visitor noticed exactly this on the letter O.

## What Changes

- Into the output layer, the view draws the strongest contributions into the **chosen output** (two thirds of the budget) and into the **runner-up** (the rest), so it shows why the chosen output beat the second one. Without a chosen output (continuous games), it keeps the global selection. Earlier layers are unchanged.
- The explanatory text under both 3D views, and the README, say so.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `demo-ui`: the 3D network view's connection selection into the output layer.

## Impact

- `web/network-math.ts` (a pure, tested `outputContributions`), `web/network-view.ts`, the two pages' texts, and the README.
