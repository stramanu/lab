# Tasks

## 1. Physics and environment

- [x] 1.1 Add the pinned Rapier dependency, the game `init` hook (scripts, worker, demo), and `src/games/quadruped/` (world, robot, pushes, falls, score, snapshot/restore, 46-value observation); verify with tests: bitwise determinism, snapshot continuation, init guard, seeded pushes, fall ends the episode, observation size
- [x] 1.2 Add the base controller (trot generator, inverse kinematics, Raibert foot placement, attitude correction) and the 4-D action mapping; verify with tests: zero action equals the base controller, walks without pushes

## 2. Planner, guard, parallel evaluation

- [x] 2.1 Add the rollout planner (21 candidates, hold 1, no pushes, satisficing, levels 0.5/1/2 s, cost) and the guard; verify with tests: same state same answer, no worse than base, cost increasing with the horizon, live state untouched, guard reject/accept, guard ≤ 1/10 of the planner's cost
- [x] 2.2 Add parallel evaluation with worker threads; verify identical results to the sequential run on Snake and on the quadruped

## 3. Feasibility spike (go/no-go)

- [x] 3.1 Write and run `experiments/quadruped-feasibility.ts` (criteria 1–6 on dev seeds, in the order of design.md); record the tuning and the result in EXPERIMENTS.md. If any criterion fails, stop and report to the user

## 4. Integration (only if the spike passes)

- [x] 4.1 Register the game (continuous spec, levels 1/2/3, reference 2, guard, agreement rule); verify `pnpm train --game quadruped` and a 3-seed dev eval
- [x] 4.2 Run the 5-run test study with parallel evaluation; verify the JSON
- [x] 4.3 Add `web/quadruped-view.ts` (three.js, lazy Rapier), the demo entry and demo data; verify in the browser (Playwright) on desktop and at 375px
- [x] 4.4 README quadruped section and references (Raibert 1986, Ijspeert 2008, Iscen et al. 2018, Di Carlo et al. 2018, Tassa et al. 2012, Howell et al. 2022, Carius et al. 2020, Lee et al. 2020, Hwangbo et al. 2019, Rapier), EXPERIMENTS.md; typecheck, tests, strict validation; archive, commit, redeploy
