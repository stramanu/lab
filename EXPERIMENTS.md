# Experiment log

Every design decision that affects the reported results, in chronological order. Each entry lists
the evidence the decision rested on, the seeds it was measured on, whether that evidence touched the
test split, and where the decision is recorded.

For the handwriting experiment (no seeds), the split is by **writer** (UJI Pen Characters v2): the
database's 20 "tst" writers are test (final numbers only); of its 40 "trn" writers, every 4th by ID
is dev (10) and the rest train (30).

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
| 22 | Handwriting: raster encoding (16×16) rather than trajectory, by the rule fixed in the design (higher mean dev top-1) | `pnpm exp handwriting-encoding`: raster 88.7% vs trajectory 88.7% (0.07 points apart, within noise); raster ECE at T = 1 0.032 vs 0.051. $P on dev: 87.3% at 57.7M operations per recognition | dev writers | – | `add-handwriting-pad` |
| 23 | Handwriting final study (targets fixed in the proposal) | `pnpm hw:study`, 5 runs: MLP top-1 83.9% ± 0.8 (top-3 92.7%), $P 83.2% (top-3 94.6%) at 1,302× the MLP's cost; ECE 0.054 → 0.019 after temperature scaling. R1 (≥ 90%) not confirmed, 0/5 runs; R2 and R3 confirmed, 5/5 runs | test writers (final) | – | `add-handwriting-pad` |
| 24 | Quadruped physics: Rapier solver with 4 internal PGS iterations; motor stiffness 300 N·m/rad, damping 8 | `pnpm exp quadruped-solver`: standing robot sags 4.8 cm and tilts 7.5° with the default solver, 0.5 cm and 0.4° with 4 × 4 | – (no seed: build pose) | No | `add-quadruped-locomotion` design |
| 25 | Quadruped: ground friction drawn per seed from U(0.7, 1.1) | Without it every seed replays the same push-free episode, so criterion 2 would test one episode 20 times | – | No | `add-quadruped-locomotion` spec |
| 26 | Quadruped base controller: levelling per hip; stance feet swept at the commanded speed (not held where they landed); heading by a left/right sweep-speed difference; 3 Hz trot at 0.4 m/s | Base controller only, no pushes, dev 10001–10006 (probe scripts, then `pnpm exp quadruped-feasibility` criterion 2 on 20 dev seeds). Trunk-centre levelling tilted 25–50°; planted stance feet drifted while standing (a fixed hip height over a planted foot lengthens the leg as the body moves away); touchdown shifts did not steer | dev | No | `add-quadruped-locomotion` design ("Changes made while building the base controller") |
| 27 | Quadruped feasibility spike v1 (criteria fixed in the proposal) | `pnpm exp quadruped-feasibility`: determinism ✓; base controller 0/20 falls at 0.35 m/s ✓; J = 8 N·s (base falls on 20%); planner falls 4/20 like the base (✗) while covering ×1.79 the distance; 178 ms per decision ✓; agreement 31.2% (✗); AUROC 0.61 (✗). The base action is only 34% of the planner's labels | dev | No | Stopped and reported to the author |
| 28 | Quadruped: declared planner revision before spike v2 (author's choice after v1). Stability term, k = 0.4 m / (π/3) rad (reaching the fall limit costs one second of base walking); satisficing margin = the base gait's 1 s variability | `pnpm exp quadruped-margin`: 5.7 mm (smaller than v1's 1 cm, so candidate differences are real, not noise). Rules fixed in design.md before any v2 measurement | dev | No | `add-quadruped-locomotion` design ("Revision after spike v1") |
| 29 | Quadruped feasibility spike v2 (revised planner, same criteria and seeds) | `pnpm exp quadruped-feasibility`: criteria 1, 2 ✓; planner falls 1/20 vs 4/20 for the base controller, ×1.63 distance ✓; 185 ms ✓; agreement 60.2% (✗, v1 31.2%); AUROC 0.65 (✗, v1 0.61). The base action is now 56% of the labels (v1 34%) | dev | No | Stopped, as fixed before v2: no System One study |
| 30 | Quadruped: EXPLORATORY follow-up (post hoc, not pre-registered; the spike verdict stands). Does System One drive well although it imitates poorly? 10× the spike's planner-driven episodes (about 8× its states) on all cores, two sizes (5 × 64×64, 5 × 256×256), the ensemble driving alone with pushes on 20 dev seeds | Author's question after spike v2; designed before any full-scale measurement (a 4-seed smoke test only checked the pipeline) | dev | No | `pnpm exp quadruped-exploratory` |
| 31 | Quadruped: run the standard 5-run test study (author's choice after decision 30), with H1–H4 unchanged; a 5 × 256×256 ensemble; pipeline sized for a 0.18 s planner (400 bootstrap episodes, 5 escalation iterations of ≤ 4,000 moves); parallel bootstrap, identical to sequential; agreement and calibration on every 4th decision | Fixed in design.md ("Study after the exploratory follow-up") before any study measurement | test (final) | No | `add-quadruped-locomotion` |
| 32 | Random baseline seeded per episode (found by an external code review): the random player drew from one stream across all episodes, so its row depended on episode order and on how seeds were split across workers | `scripts/rerun-random.ts` then re-aggregation from cached files: only the random rows change (snake 0.18 → 0.14, lander 0 → 0, warehouse 1.66 → 1.73, racing 20.6 → 20.9); every other number is bitwise identical. `check-parallel` now includes the random condition | test (final; baseline row only) | No | `tests: parallel-eval`; the quadruped study, started before the fix, will be re-aggregated the same way |
| 33 | Dataset deduplication: the hash clamped each encoding value to [0, 1] and quantized it to 1/255, so distinct states could be rejected as duplicates (found by a claims review) | Probe on planner-driven training episodes (seeds 1,000,000+): 0.3% of Snake states (5 episodes), 0.1% of lander states (20), 4.9% of warehouse states (2) wrongly rejected. First kept and documented, then fixed: states are now rejected only if identical (decision 35) | train | No | `correct-published-claims`, `fix-dataset-dedup` |
| 34 | H4 across runs judged on the runs where System One acted above the threshold (reporting bug found by a claims review: one run without such decisions made the mean undefined, and the report said System One "never acted") | Racing re-aggregated from cached runs: H4 now reads 83.4% agreement in the 3 runs where System One acted at 0.9 (it never did in 2); still not confirmed, 0/5 runs. Every other field unchanged | test (final; report text only) | No | `correct-published-claims`; `test/aggregate.test.ts` |
| 35 | Re-run the Snake, lander and warehouse studies and the Snake experiments after the deduplication fix (decision 33). No design decision was made between the first and the corrected studies; the test split was used a second time only to measure the fixed code. Both sets of results are published (the first in git history, before commit `71bdf4f`) | Corrected 5-run test studies. Snake: H2 now fails (hybrid + guard @ 0.5, 83.0% at 15.7×, 2/5 runs; first study 93.0%, 4/5 runs), because at thresholds ≤ 0.5 runs range from 227 to 370 points; @ 0.7, 97.5% at 8.8× in every run. Lander: H2 now fails (88.2% at 11.1×, 2/5 runs; first study 90.7%, 4/5). Warehouse: System One alone 36.8% → 40.2%; H4 still holds, H2 still fails. Dev experiments: `snake-deaths` 20 → 23 of 30; `snake-guard-ablation` and `snake-inputs` below | test (final) and dev | No | `fix-dataset-dedup` |
| 36 | Integrate the quadruped (5-run test study, decision 31) | System One alone 88.2% of the planner at 820× lower cost (12–23 falls in 200 episodes vs 67 for the hand-written trot); guard only 91.1% at 82.3× (2–7 falls vs the planner's 6); H2 holds in 4/5 runs, H3 in 5/5; H1 fails (82% escalation); H4 fails narrowly (94.2%, 1/5 runs). Random row re-evaluated per decision 32 before aggregation | test (final) | – | `add-quadruped-locomotion` |
| 37 | Quadruped terrain spike (exploratory; protocol, calibration rule and retraining rule fixed in `add-quadruped-terrain/design.md` before measuring) | `pnpm exp quadruped-terrain`, published network unchanged, 40 dev seeds with pushes. Calibration on the planner: at most 5/40 falls at every level, so hills up to 16° and 1 branch per metre. System One alone: 92% of the planner on flat, 88% on branches, 73% on hills, 70% on both; mean confidence 0.62 → 0.52–0.53 on hills; hybrid @ 0.9 escalation 78% → 90–91%, 94–99% of the planner's distance. Retraining rule met (hills 73%, mixed 70% < 90%) | dev | No | `add-quadruped-terrain` |
| 38 | Warehouse gridlock recorded as a limitation (a visitor saw the fleet freeze on the page) | `pnpm exp warehouse-gridlock`, 20 dev seeds: deliveries in the first vs last quarter of an episode, planner 41.6 → 13.0 (5/20 episodes end frozen), hybrid + guard @ 0.7 37.1 → 7.1 (9/20), System One 25.9 → 2.1 (10/20), greedy 19.7 → 0.1 (20/20). The planner has no deadlock resolution; a planner with one (e.g. PIBT) would be a new version of the experiment | dev | No | docs/systemone.md, Limitations |
| 39 | Quadruped terrain retraining study (targets fixed in `retrain-quadruped-terrain/design.md`) | `scripts/terrain-study.ts --split test`, 5 runs fine-tuned on varied terrain, 100 test seeds: on mixed terrain System One alone 70.4% of the planner (T1 ✗, 0/5), escalation @ 0.9 90.8% → 91.9% (T3 ✗, 1/5), hybrid @ 0.7 costlier (T4 ✗, 0/5); on flat 97.4% of the old network (T2 ✓, 5/5) but 61 vs 41 falls. Negative: a blind network does not learn terrain from its escalations | test (final) | No | `retrain-quadruped-terrain` |
| 40 | Applied quadruped, spike A1 (criteria fixed in `add-applied-mujoco-spike/design.md`): the Go1 scene in the browser | `web/applied/go1-spike/`, DeepMind's `@mujoco/mujoco` 3.14.0 (single-threaded), Chromium 153 on the M4 Max: 20 simulated seconds with a 48-512-256-128-12 MLP at 50 Hz run at 100.9× real time (flat) and 86.2× (rough terrain), the MLP taking 55–64% of the time. **Pass** (≥ 1.0×). By contrast, Playground's MuJoCo Warp backend on this CPU runs one environment at 0.2× real time | – (timing) | No | `artifacts/experiments/applied-go1-a1.json` |
| 41 | Quadruped height-scan spike (criteria fixed in `add-quadruped-height-scan/design.md`, with its declared revision: three networks) | `pnpm exp quadruped-height-scan`, 58,950 planner-labelled states on varied terrain, 40 dev seeds. C1 ✓ (no measurable cost); C3 ✗ (agreement +1.6/+1.6 points modular, +3.4/+1.4 single, on hills/mixed; ≥ 5 required); C4 ✗ (hills, alone: modular 70.0%, single 76.8%, blind 73.8% of the planner; ≥ 85% required); C5 ✓ (flat: 103% and 100% of the blind network). C6: the modular network is not better than the single one (−6.8 and −4.6 points of the planner on hills and mixed), but its confidence separates errors best (AUROC 0.77 vs 0.75 vs 0.73). No full study follows; the bottleneck is attributed to label ambiguity and the trot-modulation action, to be addressed by the applied quadruped | dev | No | `add-quadruped-height-scan`; docs/systemone.md |

## Supporting experiments (dev split)

The first five (`snake-deaths` to `lander-acceptability`) re-validate the contaminated decisions 4, 9 and
10; the others are the feasibility spikes and follow-ups of later games. All are deterministic: two
consecutive runs give identical results, timings excepted. `snake-deaths` and `snake-guard-ablation` share
one reference model, trained with the default configuration and pipeline seed 1
(`artifacts/experiments/models/`).

### `snake-deaths` (decision 4)

Unguarded hybrid at threshold 0.9, 30 dev seeds, all 30 games ending in a collision. In **23 of 30**
deaths, the last move from which the planner could still save the game (by surviving 300 more moves)
is exactly the last move System One played confidently against the planner's choice.
*The earlier, contaminated analysis reported 28 of 30 (a different model, seeds 1–30); before the
dataset fix (decision 35) this analysis gave 20 of 30. Both are superseded by this one.*

### `snake-guard-ablation` (decision 4)

Same model, 50 dev seeds. Planner: 381.7 points at 1,029 units/move.

| Hybrid | Score (±95%) | Cost / move | Escalated |
| --- | --- | --- | --- |
| no guard @ 0.7 | 58.6 ± 5.7 | 412 | 6.5% |
| no guard @ 0.9 | 95.2 ± 8.8 | 985 | 19.7% |
| no guard @ 0.95 | 129.4 ± 10.3 | 1,611 | 36.0% |
| guard only (threshold 0) | 184.9 ± 27.0 | 80 | 1.0% |
| guard @ 0.7 | 379.9 ± 6.1 | 117 | 4.8% |
| guard @ 0.9 | 375.2 ± 7.8 | 288 | 16.3% |

The decision holds: the guard is what makes the hybrid work, but only together with a confidence
threshold. With this reference model, the guard alone reaches less than half the planner's score (before
the dataset fix, with another model, it reached 318), which matches the run-to-run variance of the test
study at low thresholds.

### `snake-inputs` (decision 4)

Four encodings, same pipeline (15 escalation iterations, seed 1), 30 dev seeds, no guard.

| Encoding | Inputs | Params | System One alone | Hybrid @ 0.9 |
| --- | --- | --- | --- | --- |
| 7×7 (used) | 201 | 17,283 | 37.1 | 85.3 |
| 11×11 | 489 | 35,715 | 38.0 | 83.5 |
| 7×7 + body age, tail, rays | 263 | 21,251 | 44.1 | 98.1 |
| 11×11 + body age, tail, rays | 623 | 44,291 | 42.2 | 80.8 |

The decision holds. Richer inputs add up to 7 points to System One alone; their effect on the unguarded
hybrid is inconsistent (−4 to +13 points; before the dataset fix it was −12), and every variant stays far
below the planner's ~380.

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
action on 38.9% of consecutive decisions and matches the base controller on only 21.1% of them. Our
interpretation, as on the lander: when a continuous control problem is discretized, the planner's choice
depends on fine timing that a small classifier cannot predict confidently.

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

### `handwriting-encoding` (decision 22)

The MLP (input → 64 → 64 → 26, 60 epochs, train-only augmentation) is trained on the 30 train writers with
each encoding and 3 run seeds (101–103), and measured on the 520 samples of the 10 dev writers.

| Recogniser | Dev top-1 (mean of 3) | ECE at T = 1 | Operations per recognition |
| --- | --- | --- | --- |
| MLP, trajectory (160 inputs) | 88.65% | 0.051 | 32,000 |
| **MLP, raster (256 inputs)** | **88.72%** | **0.032** | **44,288** |
| $P, 1,560 templates | 87.31% | – | 57,657,600 |

The two encodings are tied; the rule fixed before measuring picks the higher mean, raster. $P is about
1,300× more expensive per recognition (74 ms in Node on the reference machine, after replacing
`Math.hypot` with `Math.sqrt(dx² + dy²)` as in the paper's pseudocode, which left every result unchanged).

### `quadruped-feasibility` (decision 27)

Planner: rollout algorithm over the base controller, 21 candidates, horizon 1 s (level 2). Dev seeds
10001–10020 for criteria 1–4; imitation: 40 planner-driven training episodes, 2 DAgger rounds of 10,
confidence map fitted on 5 further episodes, then 10 planner-driven dev episodes (1,521 states).

| Criterion | Measured | Threshold | Result |
| --- | --- | --- | --- |
| 1. Determinism (repeat, snapshot) | identical, identical | bitwise | pass |
| 2. Base controller without pushes | 0/20 falls, 0.349 m/s | 0/20, ≥ 0.3 m/s | pass |
| Push calibration (base-controller fall rate) | 5%, 0%, 10%, 15%, 20% for J = 4, 5, 6, 7, 8 | first J in 20–60% | J = 8 N·s |
| 3. Planner vs base controller, with pushes | 4 vs 4 falls; 9.94 vs 5.57 m (×1.79) | ≤ half the falls, ≥ ×1.2 | fail |
| 4. Planner decision time | 178 ms | ≤ 250 ms | pass |
| 5. Agreement (every component within 0.25) | 31.2% | ≥ 85% | fail |
| 6. Error detection, AUROC | 0.61 | ≥ 0.75 | fail |

The planner maximises progress over the next second without seeing pushes. It finds faster gaits (×1.79
distance), and so does not fall less. Its labels are dense and ambiguous: only 34% are the base action,
and the rest spread over the 20 other modulations. The regression ensemble averages between them and
lands within 0.25 of the chosen one in only 31% of states.

### `quadruped-feasibility` v2 (decision 29)

Same protocol, seeds and thresholds as v1; the planner revised as in decision 28. v1's JSON is kept as
`quadruped-feasibility-v1.json`.

| Criterion | v1 | v2 | Threshold | v2 result |
| --- | --- | --- | --- | --- |
| 1. Determinism | identical | identical | bitwise | pass |
| 2. Base controller without pushes | 0/20, 0.349 m/s | 0/20, 0.349 m/s | 0/20, ≥ 0.3 m/s | pass |
| 3. Falls (planner vs base), distance | 4 vs 4, ×1.79 | 1 vs 4, ×1.63 | ≤ half, ≥ ×1.2 | pass |
| 4. Planner decision time | 178 ms | 185 ms | ≤ 250 ms | pass |
| 5. Agreement | 31.2% | 60.2% | ≥ 85% | fail |
| 6. Error detection, AUROC | 0.61 | 0.65 | ≥ 0.75 | fail |

The stability term made the planner robust: it falls on 1 seed instead of 4, and still covers 63% more
distance than the base controller. Its labels became more decisive (the base action rose from 34% to
56%), and agreement doubled, but a 5 × 64 × 64 regression ensemble still matches the planner on only 60%
of planner-visited states. Its disagreement barely signals its errors (AUROC 0.65). As fixed in
design.md before v2, the experiment stops here: there is no System One study for the quadruped.

### `quadruped-exploratory` (decision 30, EXPLORATORY: post hoc, not pre-registered)

After spike v2 stopped the experiment, the author asked whether System One drives well even though it
imitates the planner poorly. The spike's verdict is unchanged; this measures what the spike did not. Data:
400 planner-driven training episodes (79k states), then per network size 2 DAgger rounds of 50 episodes
(about 98k states in total), collected on 14 threads (38 min). Evaluation on dev seeds 10001–10020 with
pushes (J = 8 N·s); agreement and AUROC on the 1,969 planner-visited states of 10 dev episodes, as in the
spike. One training run per size.

| Driver | Falls / 20 | Mean distance | vs planner | Agreement | AUROC | Compute per move |
| --- | --- | --- | --- | --- | --- | --- |
| Base controller (hand-written) | 4 | 5.57 m | 61% | – | – | 1 |
| Planner (level 2) | 1 | 9.10 m | 100% | – | – | ~4,100 |
| Ensemble 5 × 64×64 (37,140 parameters) | 2 | 7.93 m | 87% | 64.2% | 0.75 | 5 |
| Ensemble 5 × 256×256 (394,260 parameters) | 1 | 8.44 m | 93% | 65.9% | 0.81 | 5 |

With about 8× the spike's data, System One drives almost as well as the planner. The larger ensemble alone
covers 93% of the planner's distance and falls as rarely (1/20), for about 800× less compute. It still
agrees with the planner on only two thirds of states: the same pattern as racing, where several
modulations are equally good. Its disagreement now separates its errors much better (AUROC 0.81, above
the spike's 0.75 threshold). Caveats: dev seeds, one training run per size, 20 episodes (falls of 1 vs 1
are small counts). A test-split study with pre-registered targets would be needed before any claim.

