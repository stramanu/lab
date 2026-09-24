# Tasks

## Phase A — library and feasibility spike

- [x] A.1 Add continuous actions to racing (`stepContinuous`, the command → continuous mapping, shared physics) and the teacher's `targetAction`; verify with tests "pedal scaling" and "equivalence with commands"
- [x] A.2 Add the MSE loss to `Mlp` and implement `src/nn/ensemble.ts` (K members, mean action, disagreement, monotone confidence fit, cost K, export/import); verify with tests: gradient check for MSE, members differ, training reduces error, unanimous → max confidence, round trip
- [x] A.3 Write and run `experiments/racing-continuous-feasibility.ts` (criteria 1–3); record the result in EXPERIMENTS.md. If any criterion fails, stop and report to the user

## Phase B — integration (the spike failed criteria 1–2; integrated by the author's decision, reported as such)

- [x] B.1 Add spec deltas for continuous players, training, evaluation and registry, and validate the change
- [x] B.2 Implement continuous players, DAgger training with regression labels, continuous evaluation metrics and registry support; verify with tests and a smoke study
- [x] B.3 Run the 5-run racing test study; integrate the racing demo (view, network layout for the ensemble mean); update README and EXPERIMENTS.md; redeploy; archive `add-racing-game` and this change
