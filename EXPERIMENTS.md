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
