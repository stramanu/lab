# Proposal

## Why

The site grew from one experiment into several (five System One environments and a handwriting pad), but its root still redirects to the System One page, and every page assumes the visitor already knows what System One, System Two, the planner and the guard are. The author wants a generic lab where each experiment explains itself:
- what is happening;
- what the network is;
- what its inputs and outputs are;
- what the changing percentages mean.

## What Changes

- **Lab home at `/`.** It presents the lab (small, reproducible experiments in machine learning, planning and control, written from scratch and running in the browser) and lists the experiments. Each entry has its question, its environments and a one-line honest result, including negative ones. A short section describes how experiments are run: targets fixed in advance, separate dev and test splits, 5-run studies with 95% intervals, a public decision log.
- **Site layout.**
  - The home is at `/`, the System One page stays at `/systemone/`, and the handwriting page moves to `/handwriting/`. The old `/systemone/handwriting/` redirects there.
  - Shared data moves to `/data/`.
  - A navigation bar shared by every page.
- **System One page, "How it works".** A diagram and a short text:
  - the planner (System Two), the network (System One), the confidence threshold, the guard and escalation;
  - how the network learns (imitating the planner on the states it visits itself);
  - what compute units are;
  - what the "Who decided" shares mean and why System One's share grows while System Two's shrinks during training.
- **System One page, "This game" panel.** For the selected game:
  - what happens and how it is scored;
  - the network (layers and parameters, or the ensemble);
  - every input group, with its meaning and encoding;
  - the outputs;
  - what the planner and the guard do;
  - the published result.
- **Handwriting page, "How it works"** section: the pipeline from ink to letter (resampling, 16×16 raster, the network's layers, calibrated probabilities), and how $P differs.
- The content is written from the code (encodings, planners, guards) and from the published studies. It makes no new claims.

## Capabilities

### New Capabilities
- `lab-site`: the lab home, the site layout and URLs, and the shared navigation.

### Modified Capabilities
- `demo-ui`: the System One page gains the "How it works" explainer and the per-game "This game" panel.

## Impact

- `web/index.html` becomes the lab home. The System One page moves to `web/systemone/`. `web/explainers.ts` holds the per-game content, and `web/styles.css` gets the shared navigation.
- `vite.config.ts`, `scripts/build-site.ts` (the site root is the build output), and `deploy/_redirects`, `_headers` and `404.html`.
