# Tasks

## 1. Environment, baseline, planner, guard

- [x] 1.1 Implement layout, fleet, lifelong goals, decision order, conflicts, distance maps, observation, metrics and render in `src/games/warehouse/`; verify with tests: seeded layout and goals, delivery and new goal, rotating order, vertex and swap conflicts, determinism, fixed-size finite encoding
- [x] 1.2 Implement the greedy baseline, the WHCA* teacher (reservations, lazy prioritized replans, windowed space-time A*, tie-breaking, cost) and the guard; verify with tests: "blocked cell", "same state, same answer", "longer window costs no less", guard "claimed cell / free cell", "cheaper than the teacher"

## 2. Feasibility spike (go/no-go)

- [x] 2.1 Write and run `experiments/warehouse-feasibility.ts` (criteria 1–4 on dev seeds); record the result in EXPERIMENTS.md. If any criterion fails, stop and report to the user

## 3. Integration (only if the spike passes)

- [x] 3.1 Register the game (levels 1/2/3, reference 2, guard, τ = 0.0067, greedy baseline); verify `pnpm train --game warehouse` and a 3-seed dev `pnpm eval --game warehouse`
- [x] 3.2 Run the 5-run test study; verify the aggregated JSON
- [x] 3.3 Add `web/warehouse-view.ts` and the `web/games.ts` entry (window layout for the 9×9 observation), publish the demo data, and verify in the browser (Playwright)
- [x] 3.4 Update README (warehouse section, references: Wurman et al. 2008, Stern et al. 2019, Sharon et al. 2015, Silver 2005, Li et al. 2021, Sartoretti et al. 2019, Ma et al. 2021) and EXPERIMENTS.md; run typecheck, tests and strict validation; redeploy
