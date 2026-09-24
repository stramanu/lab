# Tasks

## 1. Environment, controller, planner, guard

- [x] 1.1 Implement track generation, car physics, actions, episode end, score, encoding and render in `src/games/racing/`; verify with tests: seeded tracks (identical / different), no self-intersection over 200 seeds, straight-line acceleration, friction cap, leaving the track, determinism, fixed-size finite encoding
- [x] 1.2 Implement the pure-pursuit base controller, the rollout teacher (with tie-breaking) and the guard; verify with tests "avoiding a crash", "same state, same answer", "cost grows with depth", guard "doomed / safe action" and "cheaper than the teacher"

## 2. Feasibility spike (go/no-go)

- [x] 2.1 Write `experiments/racing-feasibility.ts` (criteria 1–4 on dev seeds, pass/fail per criterion) and run it; record the result in EXPERIMENTS.md. If any criterion fails, stop here and report to the user with the numbers and design options

## 3. Integration (the spike did not pass; integrated with the continuous System One by the author's decision, in `add-continuous-student`)

- [x] 3.1 Register the game (registry: levels 1/2/3, reference 2, guard, τ from the spike's gap analysis, baseline "base controller") and verify `pnpm train --game racing` and a 3-seed dev `pnpm eval --game racing` run
- [x] 3.2 Run `pnpm study --game racing --runs 5 --split test`; verify the aggregated JSON
- [x] 3.3 Add `web/racing-view.ts` and the `web/games.ts` entry, publish the demo data, and verify in the browser (Playwright: plays with pretrained weights, three decision states, network view, frontier, no console errors, 375px)
- [x] 3.4 Update README (racing section, results, references: Kong et al. 2015, Rajamani 2012, Coulter 1992, Pan et al. 2018, Liniger et al. 2015) and EXPERIMENTS.md; run `pnpm typecheck`, `pnpm test`, `openspec validate add-racing-game --strict`; redeploy with `pnpm site:deploy` and verify the live page
