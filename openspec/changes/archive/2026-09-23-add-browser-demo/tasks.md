# Tasks

## 1. Tooling

- [x] 1.1 Add `vite` as a dev dependency, `vite.config.ts` (root `web`, base `./`, out `dist`), scripts `dev`, `build`, `preview`, and include `web/` in `tsconfig.json`; verify `pnpm build` produces `dist/index.html` from a placeholder page
- [x] 1.2 Add `scripts/copy-demo-data.ts` (`pnpm demo:data`) and commit `web/public/data/snake-weights.json` and `snake-eval-report.json`; verify the files load with `importPolicy` and parse as a report

## 2. Training session

- [x] 2.1 Add `TrainingPipeline.snapshot()` and `src/training/session.ts` (`runSession` with `shouldStop`, `onStep`, `yieldControl`); verify with a test that a reduced session and `pipeline.run()` export identical weights
- [x] 2.2 Verify with a test that `shouldStop` ends the session after the current escalation iteration and that no further steps are reported
- [x] 2.3 Implement `web/protocol.ts` and `web/worker.ts` as a thin shell over `runSession`; verify with `pnpm typecheck` and the browser check in 5.2

## 3. Page building blocks

- [x] 3.1 Implement `web/charts.ts` (linear/log scales, ticks, line chart, scatter) with pure scale helpers; verify with unit tests on scale mapping and log ticks
- [x] 3.2 Implement `web/frontier.ts` (report → typed points with kind, label, cost, score; zero-cost handling); verify with a unit test on the committed report that every condition yields a point
- [x] 3.3 Implement `web/game-view.ts` (grid, snake, food, head colored by decider, counters) and `web/bars.ts` (probability bars, chosen action, threshold line); verify with the browser check in 5.2
- [x] 3.4 Implement `web/recorder.ts` with MIME fallback and disabled state; verify with the browser check in 5.2

## 4. Page wiring

- [x] 4.1 Write `web/index.html` and `web/styles.css`: responsive layout, light/dark tokens, labeled controls, legend with the three decision states; verify there is no horizontal scroll at 375px wide in the browser check
- [x] 4.2 Implement `web/main.ts`: live game loop with speed accumulator and frame budget, hybrid rebuilt on threshold/guard change, pretrained load, worker start/stop, weight hot-swap, curves and counters; verify with the browser check in 5.2

## 5. Verification and docs

- [x] 5.1 Run `pnpm typecheck`, `pnpm test`, `pnpm build` and `openspec validate add-browser-demo --strict`; all green
- [x] 5.2 Browser check with Playwright on the built site: load pretrained weights and confirm the game plays with all three indicator states over time; change the threshold and see the bars' threshold line move; start training and confirm at least two curve points arrive and the live game hot-swaps weights; stop training; record a short clip and get a download; confirm the frontier shows every condition; no console errors; screenshots at desktop and 375px widths
- [x] 5.3 Update `README.md` with the demo commands and a short description of the page
