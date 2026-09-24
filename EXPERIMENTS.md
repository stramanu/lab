# Experiment log

Every design decision that affects the reported results, in chronological order. Each entry lists
the evidence the decision rested on, the seeds it was measured on, whether that evidence touched the
test split, and where the decision is recorded.

Seed splits: **test** 1–200 (final numbers only), **dev** 10,001–10,200 (decisions, ablations,
experiments), **train** ≥ 1,000,000. Other ranges below (5000+, 6000+, 7000+, 8000+, 9000+) are ad-hoc
benchmark seeds that belong to neither dev nor test. The splits were formalised in change
`add-research-protocol`. Earlier entries used "evaluation seeds 1–200", i.e. today's test split,
and a few decisions looked at them. Those entries are marked **contaminated** and were re-validated
on dev with a committed experiment (`pnpm exp <name>`, results in `artifacts/experiments/`).

Design notes for every change live in `openspec/changes/archive/<date>-<change>/design.md`.

| # | Decision | Evidence | Seeds | Contaminated? | Re-validation / status |
| --- | --- | --- | --- | --- | --- |
| 1 | Hypotheses H1–H4 and their numeric targets | Experiment design document, written before any code | – | No | Targets never changed |
| 2 | Snake planner: value "eat" branches by the remaining discount sum | `pnpm bench:teacher`: with the bug, depth 1 averaged 7 points; after the fix, 391 | 9000–9019 | No | `add-headless-snake-pipeline` design |
| 3 | Snake planner tie-breaking (straight > left > right) and τ = 0.1 | Top-2 score gaps: 22% exact ties, 39% below 1 point. Training run: escalation 65% → 17%, validation agreement 85% → 96% | 778–780, train | No | `add-headless-snake-pipeline` design |
| 4 | Snake: add the guard instead of richer inputs or a risk head | Unguarded-hybrid death analysis; input variants; guard and risk-head prototypes | 1–30 | **Yes** | Dev: `snake-deaths`, `snake-inputs`, `snake-guard-ablation` (below) |
| 5 | H2 report shows the variant closest to both targets when none passes | Reporting-only change, no number changed | – | No | `add-hybrid-guard` |
| 6 | Lander physics: tank 12 s → 20 s of burn | Autopilot failures were mostly fuel exhaustion (56% → 82% landings) | 5000–5099 | No | `add-lander-game` design |
| 7 | Lander planner: random-shooting MPC → rollout algorithm over the autopilot | Random shooting: 0% landings at every level; perturbed rollouts: 62–78%; rollout algorithm: 100% | 5000–5049 | No | `add-lander-game` design |
| 8 | Lander tie-breaking and τ = 0.03 | Top-2 gaps: 14.9% exact ties, 57% below 0.5 points | 7000–7019 | No | `add-lander-game` design |
| 9 | Lander: satisficing margin and preference for the autopilot's action | Imitation diagnostics (capacity, inputs, autopilot imitation) on training data. The quick 30-seed check of the earlier model used seeds 1–30 | train, 8000+; **1–30** | **Partly** | Dev: `lander-imitation` (below) |
| 10 | Lander: do not adopt the acceptability head | Prototype on 30 seeds | 1–30 | **Yes** | Dev: `lander-acceptability` (below) |
| 11 | Seed splits, multi-seed studies, one script per claim | Methodological review before publication | – | – | `add-research-protocol` |
| 12 | Racing: fix the drag coefficient (0.02 → 0.002·v²) | Top speed was capped at ~14 m/s, so corners never mattered (planner = controller = 820 m) | 20000–20049 | No | `add-racing-game` design |
| 13 | Racing planner: rollouts at speed margins {0.85 … 1.25} | Planner/controller progress: +0.5% (controller margin only) → +8.8% (3 margins) → +11.2% (5 margins) | 20000–20019 | No | `add-racing-game` design |
| 14 | Racing feasibility spike (go/no-go criteria fixed in the proposal) | `pnpm exp racing-feasibility`: on-track 100% ✓, progress ratio 1.102 ✓, exact ties 0.16% ✓, imitation agreement **80.7% ✗** (threshold 85%) | dev 10001–10030 (+ train) | No | **Stopped**; see below |
| 15 | Racing: declared τ revision (τ = smallest preference step / 3) and a single re-run of criterion 4 | Agreement 82.2% ✗ | dev (+ train) | No | Failed → design revision |
| 16 | Racing: incremental steering commands {left, hold, right} × pedal | Adjacent-steering-level confusions were 16.4 of 17.8 error points. Full spike re-run: 100% ✓, 1.198 ✓, 0.58% ✓, agreement **80.5% ✗** | dev (+ train) | No | **Stopped**; decision with the author |
| 17 | Continuous System One (deep-ensemble regression) for racing; new spike with criteria fixed in `add-continuous-student` | `pnpm exp racing-continuous-feasibility`: agreement **77.4% ✗** (≥ 85%), error-detection AUROC **0.55 ✗** (≥ 0.75), alone on track 100% ✓ (≥ 80%). Alone progress 1,361 m vs base controller 1,103 m on the same seeds | dev (+ train) | No | **Stopped**; decision with the author |
| 18 | Integrate racing with the continuous System One despite the failed spike (author's decision) | 5-run test study: System One alone 99.9% of the planner at 1,164× lower cost; guard only 101.9% at 97×; H2 and H3 hold in 5/5 runs; H1 and H4 fail; ECE 0.27 | test (final) | – | `add-continuous-student`, `add-racing-game` |
| 19 | Warehouse planner: stateless cooperative space-time search (predicted trajectories) instead of stateful WHCA* | Determinism requirement (same state, same answer); decided before any measurement | – | No | `add-warehouse-mapf` design |
| 20 | Warehouse feasibility spike (criteria fixed in the proposal) | `pnpm exp warehouse-feasibility`: 0 collisions and 4.58× greedy deliveries ✓, exact ties 0% ✓, imitation agreement 93.9% ✓, error-detection AUROC 0.877 ✓ | dev (+ train) | No | **Passed**; integrated |
| 21 | Integrate the warehouse (spike passed) | 5-run test study: System One alone 36.8% of the planner; best hybrid + guard 88% at 4.1× lower cost; H4 holds in 5/5 runs (97.4%, ECE 0.018); H1, H2 and H3 fail. Closed-loop agreement 76.2% vs 93.9% offline in the spike | test (final) | – | `add-warehouse-mapf` |

## Re-validation on the dev split

All five experiments are deterministic: two consecutive runs give identical results, timings excepted.
The Snake experiments use one reference model per game, trained with the default configuration and
pipeline seed 1 (`artifacts/experiments/models/`).

### `snake-deaths` (decision 4)

Unguarded hybrid at threshold 0.9, 30 dev seeds, all 30 games ending in a collision. In **20 of 30**
deaths, the last move from which the planner could still save the game (by surviving 300 more moves)
is exactly the last move System One played confidently against the planner's choice.
*The earlier, contaminated analysis reported 28 of 30. That figure came from a different model on
seeds 1–30 and is superseded by this one.*

### `snake-guard-ablation` (decision 4)

Same model, 50 dev seeds. Planner: 381.7 points at 1,029 units/move.

| Hybrid | Score (±95%) | Cost / move | Escalated |
| --- | --- | --- | --- |
| no guard @ 0.7 | 65.8 ± 5.5 | 336 | 5.4% |
| no guard @ 0.9 | 87.2 ± 7.7 | 850 | 16.1% |
| no guard @ 0.95 | 118.6 ± 11.0 | 1,346 | 29.4% |
| guard only (threshold 0) | 318.1 ± 26.5 | 51 | 1.4% |
| guard @ 0.7 | 372.7 ± 7.3 | 107 | 4.2% |
| guard @ 0.9 | 378.6 ± 6.8 | 246 | 15.2% |

The decision holds: the guard is what makes the hybrid work.

### `snake-inputs` (decision 4)

Four encodings, same pipeline (15 escalation iterations, seed 1), 30 dev seeds, no guard.

| Encoding | Inputs | Params | System One alone | Hybrid @ 0.9 |
| --- | --- | --- | --- | --- |
| 7×7 (used) | 201 | 17,283 | 35.7 | 95.3 |
| 11×11 | 489 | 35,715 | 36.2 | 83.0 |
| 7×7 + body age, tail, rays | 263 | 21,251 | 45.7 | 83.4 |
| 11×11 + body age, tail, rays | 623 | 44,291 | 45.1 | 83.0 |

The decision holds. Richer inputs add about 10 points to System One alone and nothing to the hybrid;
all variants stay far below the planner's ~380.

### `lander-imitation` (decision 9)

Labels from 150 training episodes; agreement measured on 20 dev episodes; 40 epochs.

| Target | Network | Dev agreement |
| --- | --- | --- |
| Planner | 64×64 | 69.0% |
| Planner | 256×256 | 75.7% |
| Planner, 20 inputs (wind, trend, obstacle, time) | 64×64 | 66.7% |
| Autopilot | 64×64 | 73.7% |
| Autopilot | 256×256 | 78.0% |

The autopilot is bang-bang: none 41.7%, main 42.4%, left and right 8% each, and it switches action on
59.9% of consecutive decisions. Capacity helps a little (+7 points). Extra inputs do not help. Even the
autopilot cannot be imitated beyond ~78%. The conclusion that equivalent actions, not capacity, cap
agreement holds. Capacity is a secondary factor and should be stated as such.

### `lander-acceptability` (decision 10)

Sigmoid acceptability head (δ = 1.5), with bootstrap plus 6 DAgger rounds on training seeds, evaluated
on 30 dev seeds. On average 2.9 of the 4 actions are acceptable.

| Player | Landed | Score | Cost / move | Escalated |
| --- | --- | --- | --- | --- |
| System One alone | 26/30 | 106.8 | 1 | 0% |
| hybrid @ 0.8 | 25/30 | 103.3 | 300 | 3.9% |
| hybrid + guard @ 0.8 | 24/30 | 99.9 | 368 | 4.7% |
| hybrid @ 0.9 | 19/30 | 78.6 | 1,840 | 19.8% |
| hybrid + guard @ 0.95 | 25/30 | 107.3 | 4,839 | 48.4% |

The decision holds: System One alone is strong, but no threshold gives a hybrid that beats it cheaply.

### `racing-feasibility` (decision 14)

Criteria fixed in the `add-racing-game` proposal before measuring. Planner: rollout algorithm, horizon 40,
margins {0.85, 0.95, 1.05, 1.15, 1.25}. 30 dev seeds for criteria 1–3. For criterion 4: 40 training episodes
(24,000 states) and 10 dev episodes (6,000 states), a 64×64 network, 30 epochs, τ = 0.05.

| Criterion | Measured | Threshold | Result |
| --- | --- | --- | --- |
| 1. Planner stays on track | 100% | ≥ 90% | pass |
| 2. Planner ÷ controller progress | 1.102 (1,190 m vs 1,079 m) | ≥ 1.10 | pass (narrow) |
| 3. Exact ties | 0.16% | < 20% | pass |
| 4. Imitation agreement (dev) | 80.7% | ≥ 85% | **fail** |

Gap distribution: 23.5% of decisions have a top-2 gap below 0.05, where only the tie-breaking preferences
(0.02–0.3) separate the actions. **Disclosed flaw:** the design said τ would be chosen from this gap
analysis, but the spike script used a fixed τ = 0.05 without it. Per the protocol, implementation stopped
here and the decision on how to proceed went to the author.

Re-runs (the criteria and thresholds never changed):

| Version | Change | 1. on track | 2. progress ratio | 3. exact ties | 4. agreement |
| --- | --- | --- | --- | --- | --- |
| v1 (`racing-feasibility-v1.json`) | first design, τ = 0.05 | 100% | 1.102 | 0.16% | 80.7% ✗ |
| v2 (`racing-feasibility-v2.json`) | τ rule (0.0067) | 100% | 1.102 | 0.16% | 82.2% ✗ |
| v3 (`racing-feasibility.json`) | incremental steering + τ rule | 100% | 1.198 | 0.58% | 80.5% ✗ |

v3 error breakdown on dev states: "hold vs turn" 13.1 points, pedal 4.9, left vs right 0.1. The planner switches
action on 38.9% of consecutive decisions and matches the base controller on only 21.1% of them. As on the
lander, when a continuous control problem is discretized, the planner's choice depends on fine timing that
a small classifier cannot predict confidently.

### `racing-continuous-feasibility` (decision 17)

K = 5 ensemble of 20→64→64→2 regressors (MSE on the planner's continuous action). Trained on 40
planner-driven training episodes plus 2 DAgger rounds of 10 episodes, with the confidence map fitted on 5
further episodes. Criteria 1–2 are measured on 10 planner-driven dev episodes (6,000 states), criterion 3 on
20 dev episodes driven by the ensemble alone.

| Criterion | Measured | Threshold | Result |
| --- | --- | --- | --- |
| 1. Agreement (≤ 0.03 rad steering, same pedal sign) | 77.4% | ≥ 85% | fail |
| 2. Disagreement detects errors (AUROC) | 0.55 | ≥ 0.75 | fail |
| 3. Ensemble alone stays on track | 100% | ≥ 80% | pass |

Alone, the continuous student covers 1,361 m against the base controller's 1,103 m on the same 20 dev seeds
(×1.23). In spike v3, on different dev seeds, the discrete planner itself reached ×1.20 over the controller.
The student drives with continuous steering and pedal, while its teacher is limited to discrete commands.
It therefore **matches or beats its teacher on the task** while "disagreeing" on 23% of decisions, and its
uncertainty carries almost no information about its errors. For this game the premise of escalation (a
student that needs its teacher and knows when) does not hold.

### `warehouse-feasibility` (decision 20)

Planner: cooperative space-time search, window 8, 16 robots on a 32×20 grid, 300 timesteps. Baseline: greedy
distance-map descent. It deadlocks, with 89% of moves spent waiting on ad-hoc seeds, and is reported as the
hand-written reference. Criteria 1–2 on 20 dev seeds. Criteria 3–4: 40 training episodes subsampled every
6th decision (32,000 states), 10 dev episodes (8,000 states), a 64×64 network, 30 epochs, τ = 0.0067.

| Criterion | Measured | Threshold | Result |
| --- | --- | --- | --- |
| 1. Collision-free and gain over greedy | 0 collisions; 110.3 vs 24.1 deliveries (×4.58) | 0 and ≥ ×1.20 | pass |
| 2. Exact ties | 0% | < 20% | pass |
| 3. Imitation agreement (dev) | 93.9% | ≥ 85% | pass |
| 4. Error detection, AUROC of 1 − confidence | 0.877 | ≥ 0.75 | pass |
