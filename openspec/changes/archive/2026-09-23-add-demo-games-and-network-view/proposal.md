# Proposal

## Why

The demo shows only Snake, and its frontier panel still plots the old single-run report. The research now covers two games, with 5-run test studies, and more games are planned, so the page needs a game selector driven by the game registry, and it has to show the published study results. The user also asked for a 3D view of the network while it plays. Showing the real activations and the connections that actually drive each decision makes "System One" tangible and fits the project's transparency.

## What Changes

- **Game selector** (Snake, Lander), driven by the shared game registry: the environment, planner, guard, action names, pretrained weights and study results all follow the selected game. Adding a game to the registry and its data files adds it to the page.
- **Lander view**: terrain, pad, ship attitude, engine flames for the action just played, a wind indicator, and a flight trail colored by who decided each move.
- **3D network view** of System One: every decision is shown as the real forward pass of the live model.
  - The input layer is laid out meaningfully: the Snake 7×7 egocentric window as a plane, the lander's 16 labeled inputs.
  - The two hidden layers appear as neuron grids, with brightness equal to the activation.
  - For each decision, only the connections with the largest |weight × input activation| are drawn, colored by sign.
  - The output nodes show each action's probability, the threshold, and the color of who decided.
  - The camera can be orbited; the view is paused when off-screen and falls back gracefully without WebGL.
- **Published results**: the frontier plots the 5-run study means with 95% intervals (error bars) from `artifacts/<game>/study/study-test-200.json`, and the page states the split and the number of runs.
- **Pretrained weights**: run 1 of each game's study, a choice fixed in advance (the first training seed), not the best run. The page says which run is shown.
- **In-tab training** works for any registered game.

Out of scope: new games, deployment, changes to the methods.

## Capabilities

### New Capabilities
<!-- None: all changes extend existing demo capabilities. -->

### Modified Capabilities
- `demo-ui`: game selector; per-game pretrained weights and views; frontier from the multi-run study with intervals; new 3D network view.
- `demo-training`: background training for the selected registered game.
- `micro-policy-net`: expose the intermediate activations of a forward pass (used by the network view).

## Impact

- New `web/lander-view.ts`, `web/network-view.ts`, `web/games.ts` (per-game UI adapters). Changes to `web/main.ts`, `web/index.html`, `web/styles.css`, `web/frontier.ts`, `web/worker.ts`, `web/protocol.ts`.
- New runtime dependency: `three`, used only by the network view and bundled by Vite. `src/nn/mlp.ts` gains an activation trace.
- `scripts/copy-demo-data.ts` publishes `<game>-weights.json` (study run 1) and `<game>-study.json` for every registered game.
