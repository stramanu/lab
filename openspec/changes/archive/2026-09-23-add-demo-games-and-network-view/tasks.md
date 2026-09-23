# Tasks

## 1. Library and data

- [x] 1.1 Add `Mlp.trace(x)` returning input, hidden activations and logits; verify with a test that softmax(logits) equals `probs` within 1e-6 and hidden values are ReLU outputs
- [x] 1.2 Update `scripts/copy-demo-data.ts` to publish `<game>-weights.json` (study run 1) and `<game>-study.json` for every registered game, remove the old report, and run it; verify the files load (weights via `importPolicy`, study via the frontier adapter)

## 2. Per-game demo plumbing

- [x] 2.1 Add `web/games.ts` (UI adapter per registry game) and make the worker train the selected game with its registry defaults; verify with `pnpm typecheck` and the browser check in 4.2
- [x] 2.2 Update `web/frontier.ts` to read study files (mean, interval, kinds incl. baseline) and draw score error bars; verify with a unit test on both published study files
- [x] 2.3 Implement `web/lander-view.ts` (terrain, pad, ship, flames, wind, decider trail); verify in the browser check

## 3. 3D network view

- [x] 3.1 Add `three` and implement `web/network-view.ts` (lazy import, layouts for Snake and lander, top-K contribution edges, throttled updates, off-screen pause, WebGL fallback, orbit controls); verify the pure edge-selection helper with a unit test (top-K by |w·a|, sign) and the rest in the browser check
- [x] 3.2 Wire the game selector, the per-game views, the network panel and the study-based frontier into `web/index.html`, `web/styles.css` and `web/main.ts`; verify in the browser check

## 4. Verification and docs

- [x] 4.1 Run `pnpm typecheck`, `pnpm test`, `pnpm build` and `openspec validate add-demo-games-and-network-view --strict`; all green
- [x] 4.2 Browser check with Playwright on the built site:
  - Snake and lander both play with pretrained weights, and the three decision states appear;
  - switching games resets counters and curves;
  - the network view renders and its outputs match the bars;
  - the frontier shows every study condition with error bars;
  - in-tab training works for the lander;
  - no console errors;
  - desktop and 375px screenshots.
- [x] 4.3 Update the README demo section
