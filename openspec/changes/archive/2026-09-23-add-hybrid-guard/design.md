# Design

## Context

The motivation and the evidence are in proposal.md (Why). The prototype lived in a scratch script. On the existing weights and 30 evaluation seeds (teacher at depth 1 = 384 points, 1,018 units/move) it measured:

| Hybrid | Score | Cost/move | Escalated | Teacher/hybrid cost |
| --- | --- | --- | --- | --- |
| confidence 0.9 (current) | 83.6 | 1,020 | 18.3% | 1.0x |
| confidence 0.9 + learned risk head | 107–119 | 944–990 | ~21% | 1.1x |
| confidence 0.9 + guard | 375.4 | 297 | 14.6% | 3.4x |
| confidence 0.7 + guard | 362.2 | 116 | 5.0% | 8.7x |
| guard only (threshold 0) | 208.5 | 80 | 1.4% | 12.7x |

The guard alone costs about 65 units per move on average, against about 1,000 for the planner.

## Goals / Non-Goals

**Goals:**
- A working Snake: the guarded hybrid satisfies H2 on the 200 evaluation seeds.
- Keep the guard game-agnostic, so the lander can plug in its own guard (e.g. a short physics rollout of the proposed action).
- Keep cost accounting honest: the guard is never free, and its share of the cost is reported separately.

**Non-Goals:**
- Changing the network, the encoding or the confidence measures.
- Tuning targets. H1–H4 targets stay as declared.

## Decisions

### Guard contract
`Guard.check(env, action) → { ok: boolean, cost: number }`, added to `src/core/types.ts`. The guard receives the live environment and must not mutate it: it clones internally, like the teacher. The hybrid takes an optional guard. A game exposes one through `GameSpec.guard?`.
Alternative considered: folding the check into the student (features that include per-action reachability). Rejected: it would run the check on all 3 actions instead of 1, and it would hide planner work inside "one forward pass", which misstates the cost.

### Snake guard
Clone, `step(action)`; if the episode ended and it was not a win → reject. Otherwise run `tailReachable` (it already stops as soon as the tail is found) → reject if unreachable. Cost = 1 (the simulated step) + BFS nodes, from the existing `CostCounter`. This reuses the search primitive of the teacher: the guard is literally a fragment of System Two, run on one action only.

### Hybrid decision order
confidence check → guard (only if confident) → teacher (only if needed). The guard never runs on low-confidence moves, because those escalate anyway, so running it would be wasted cost. `MoveRecord` gains `escalationReason?: 'confidence' | 'guard'` and `guardCost?: number`.

### Training
`PipelineConfig.useGuard` (default `true`) wires `GameSpec.guard` into the escalation-loop hybrid. Guard-rejected states are ordinary teacher-labeled examples, so no dataset changes are needed. The iteration log adds `guardEscalationRate`. The training threshold stays 0.9, as in the first change: we do not tune it toward H1.

### Evaluation
`standardConditions` takes an optional `guard`. With it, it adds `hybrid+guard <measure>@<threshold>` for every threshold and measure, plus `guard only` (threshold 0, primary measure). The runner aggregates `escalationByReason` and `guardCostShare`. H2 considers every hybrid condition. H4 stays at threshold 0.9 on the primary measure *without* guard, because it measures the student's calibration and the guard would filter the sample. H1 uses the training log, which now reflects the guarded loop.

## Risks / Trade-offs

- [The guard hides a weak student] → the unguarded hybrid and System One alone remain in the report as the ablation, and the guard's cost share is explicit.
- [H2 cost ratio lands just below 10x] → the result is reported as measured. Retraining with the guard is expected to cut escalations, because the student learns the trap states, but we do not tune targets or cherry-pick seeds.
- [A tail-reachability guard misses traps that need more lookahead] → acceptable: the prototype already reaches 98% of the teacher at threshold 0.9. A deeper guard would move cost toward the planner.
- [Guard semantics for other games] → the contract only fixes determinism, non-mutation and cost reporting. Each game defines what "unsafe" means.
