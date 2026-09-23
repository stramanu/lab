# Design

## Context

Everything in `src/` is browser-compatible by construction (tested: no `node:` imports, no `Math.random`). In Node the pipeline trains in ~105 s. It is synchronous and exposes its phases as methods (`bootstrap`, `escalationIteration`, `consolidate`). A decision costs ~6 µs for System One, ~50 units for the guard and ~17 µs for the planner, so the live game can run hybrid inference on the main thread while training runs in a worker. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One static page that works offline once loaded: open it, load the pretrained weights, watch; or train in-tab in about two minutes.
- Reuse `src/` unchanged in behavior; add only what the worker hand-off needs.
- Keep the page honest: the numbers shown (cost per move, escalation share) are computed exactly as in the evaluation harness.

**Non-Goals:**
- UI framework, component library or chart library.
- Server, accounts, analytics, hosting setup.
- H5 / per-tick budget visualizations (a later change).

## Decisions

### Tooling: Vite, vanilla TypeScript, Canvas 2D
Vite (dev dependency) with `root: 'web'`, `base: './'` so `dist/` works from any path, output to `dist/`. Plain TypeScript modules and DOM APIs, and Canvas 2D for the game and charts.
Rejected alternatives: React/Svelte, which add a dependency and a build layer for about six widgets; Chart.js/uPlot, which would be heavier than the two small charts we need (line and log-x scatter). Owning them also matches the project's "from scratch" narrative.

### Page layout
```
web/
  index.html        layout, controls, canvases
  styles.css        CSS variables for light/dark, responsive grid (single column below 720px)
  main.ts           wiring: state, game loop, controls, worker messages
  game-view.ts      Snake canvas renderer + decision indicator
  bars.ts           probability bars with threshold line
  charts.ts         tiny line chart and log-x scatter on canvas (pure scale helpers exported for tests)
  frontier.ts       report → frontier points (pure, tested)
  recorder.ts       canvas.captureStream + MediaRecorder → downloadable blob
  protocol.ts       typed worker messages
  worker.ts         thin shell around TrainingSession
  public/data/      snake-weights.json, snake-eval-report.json (committed)
```

### Training session (worker)
New `src/training/session.ts`: `runSession(pipeline, { shouldStop, onStep, yieldControl })` calls bootstrap, then escalation iterations, then consolidation. After every step it calls `onStep(logEntry, snapshot)` and `await yieldControl()`, so the worker can process `stop` messages between iterations. `TrainingPipeline` gains `snapshot(): SerializedPolicy` (current weights + temperature), a pure read. The worker shell only translates messages. Because the session calls exactly the same methods in the same order as `run()`, the final weights are identical, and a Node test runs both and compares.
Protocol: page → worker `{type:'start', config}` | `{type:'stop'}`; worker → page `{type:'progress', entry, policy}` | `{type:'done', policy}` | `{type:'error', message}`.

### Live game loop
The main thread runs `requestAnimationFrame`. Speed is expressed in moves per second (5 to 2,000), with an accumulator deciding how many moves to play per frame, capped at a per-frame time budget so rendering never starves. The page's `HybridPlayer` (teacher at depth 1 + `SnakeGuard`) is rebuilt when threshold or guard settings change; the net is replaced in place when new weights arrive. Seeds for live episodes start from the chosen seed and increment. They are display seeds only, unrelated to evaluation.

### Decision indicator colors
Three states with fixed semantic colors defined as CSS variables, also used by the curves: System One (green), guard-stopped (amber), System Two on low confidence (red). Labels are always shown next to the colors, so they are not the only cue.

### Frontier panel
It reads `snake-eval-report.json` and plots `costPerMove` (log x) against mean score for every condition. Markers: System Two = squares, unguarded hybrids = hollow circles, guarded hybrids = filled circles, System One / random / guard only = diamonds, with a label on hover or tap and a static legend. Random (cost 0) is drawn at the left edge with a note, because log scale cannot place 0.

### Video export
`canvas.captureStream(30)` + `MediaRecorder`, using the first supported of `video/webm;codecs=vp9`, `video/webm`, `video/mp4`. Download via an object URL. If `MediaRecorder` is unavailable, the button is disabled with an explanation.

### Data files
`scripts/copy-demo-data.ts` (`pnpm demo:data`) copies `artifacts/snake/weights.json` and `eval-report.json` into `web/public/data/`. The copies are committed, so a fresh checkout builds a working demo without retraining.

## Risks / Trade-offs

- [Worker memory: the 100k-state dataset is ~80 MB] → acceptable on desktop; on phones training may be slow or fail, so the page recommends the pretrained weights on small screens and reports worker errors.
- [Browser timing differs from Node] → the page shows cost in compute units (hardware-independent) as the primary number; µs are secondary.
- [Main-thread planner calls at high speed] → per-frame time budget caps work per frame; at extreme speeds the effective speed is lower than requested, and the page shows the actual moves/s.
- [Pipeline synchronous steps block the worker for ~3 s per iteration] → the stop latency is bounded by one iteration, as the spec allows.
