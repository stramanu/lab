# Tasks

## 1. Lander environment

- [x] 1.1 Implement config, seeded terrain/pad/wind generation and the physics step in `src/games/lander/`; verify with tests for free fall, main engine vs gravity, side thrusters' angular acceleration, fuel consumption and empty tank
- [x] 1.2 Implement ground contact, landing limits, out-of-bounds, time limit, score and summary; verify with tests for soft landing, hard landing, off-pad touch, out of bounds and timeout
- [x] 1.3 Verify determinism (same seed and actions → same states) and seeded-world differences with tests
- [x] 1.4 Implement the 16-value encoding and textual render; verify length, finiteness and the `onPad` flag with tests

## 2. MPC teacher and guard

- [x] 2.1 Implement the planner (final form: deterministic rollout algorithm over an autopilot, see design) with cost in physics steps; verify "obvious crash avoidance", "scores for every action", "same state, same answer" and "cost grows with the knob"
- [x] 2.2 Implement the lander guard (one decision + recovery rollout); verify "doomed action", "safe action high above the pad" and "cheaper than the teacher"

## 3. Planner tuning

- [x] 3.1 Write `scripts/bench-lander.ts` (landing rate, fuel, impact speed, time per decision, cost per decision at the three knob levels, random baseline) and run it on 50 non-evaluation seeds
- [x] 3.2 Tune physics and planner (final: fuel 20 s, autopilot base policy, rollout algorithm) until the default teacher lands ≥ 90% on those seeds; record the chosen values in design.md; verify with a test on a small seed subset that the teacher lands ≥ 90% and random ≤ 5%
- [x] 3.3 Measure the distribution of the teacher's top-2 score gaps and choose τ; record the analysis in design.md

## 4. Training and evaluation

- [x] 4.1 Add the game registry (`src/games/registry.ts`) and the generic `scripts/train.ts --game` (Snake and lander, same options as before) with `train:*` aliases; verify `pnpm train:snake` behavior is unchanged (reproducibility test) and verify that `pnpm train:lander` completes and writes `artifacts/lander/weights.json` and `train-log.jsonl`, and record time and final escalation
- [x] 4.2 Write the generic `scripts/eval.ts --game` using the standard conditions (three knob levels, guarded and unguarded hybrids) plus registry baselines (autopilot) and game metrics in the report, with `eval:*` aliases; verify by running it on the 200 evaluation seeds
- [x] 4.3 Verify the pipeline reproducibility test passes for a reduced lander configuration (same weights twice)

## 5. Wrap-up

- [x] 5.1 Run `pnpm typecheck`, `pnpm test` and `openspec validate add-lander-game --strict`; all green
- [x] 5.2 Update `README.md` with the lander: rules in brief, commands, results table and H1–H4 as measured (targets unchanged), and the comparison with Snake
