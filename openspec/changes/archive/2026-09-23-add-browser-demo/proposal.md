# Proposal

## Why

The headless pipeline works: the guarded hybrid plays Snake at 98% of the planner's score for about a tenth of its compute per move. The experiment's point, and the post's hook, is to *see* that happen and to reproduce it in your own browser tab: watch System One take over from System Two as it trains, and see when it hands control back. The code in `src/` was kept browser-compatible for exactly this step.

## What Changes

- A single static web page (no backend) that runs Snake at real speed with the hybrid playing, and a colored indicator for who decided each move: System One, System One stopped by the guard, or System Two on low confidence.
- Per-action probability bars, updated at every decision, with the confidence threshold drawn on them.
- In-tab training in a Web Worker, reusing the existing three-phase pipeline. Progress streams to the page, and after every retraining the page swaps in the new weights, so the live game visibly improves while the model trains.
- Live curves: escalation rate (total and guard), mean score and mean cost per move, per training iteration.
- Controls: start/stop training, load the pretrained weights shipped with the page, confidence threshold, guard on/off, game speed, seed.
- A results panel that renders the cost–quality frontier from the published evaluation report.
- A recorder that exports the game canvas as a video file, so anyone can reproduce the post's clips.
- Build tooling: `pnpm dev` and `pnpm build` produce a static site in `dist/`.

Out of scope: lander, per-tick compute budget (H5) and the budget–score curve, GIF encoding (video only), the in-browser LLM, hosting and deployment.

## Capabilities

### New Capabilities
- `demo-training`: in-tab training in a background worker, with streamed progress, cancellation, weight hand-off to the page and reproducibility.
- `demo-ui`: the demo page: live game with decision indicator, probability bars, curves, controls, pretrained weights, results panel and video export.

### Modified Capabilities
<!-- None: the demo consumes the existing capabilities without changing their requirements. -->

## Impact

- New `web/` directory (page, styles, worker, UI modules) and `vite.config.ts`; new dev dependency `vite`.
- New scripts `dev`, `build`, `preview`; `tsconfig.json` includes `web/`.
- The pretrained weights and the evaluation report are copied into `web/public/data/` and committed (about 100 KB), so the page works without training.
- No changes to `src/` behavior. Small additions only if the worker needs them, e.g. an async-friendly way to step the pipeline.
