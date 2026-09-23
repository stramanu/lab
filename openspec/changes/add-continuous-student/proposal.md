# Proposal

## Why

On two control games the discrete System One could not imitate its planner confidently:
- lander: 69–76% agreement;
- racing: 80.5% after two declared revisions (EXPERIMENTS.md, entries 9–16).

The diagnosis is the same in both. Once continuous control is discretized, the planner alternates near-equivalent actions (bang-bang, or "hold vs turn"), and only fine timing separates them. A per-class confidence cannot be meaningful there. The standard way to distil an MPC into a driving policy is to **regress the continuous control** (Pan et al., RSS 2018), and a standard, simple way to get uncertainty from small networks is a **deep ensemble** (Lakshminarayanan et al., NeurIPS 2017). A regressor trained on alternating targets learns their average, which is the smooth control the alternation approximates.

## What Changes

- **Continuous actions for racing.** Next to the discrete commands the planner searches over, the racing environment accepts a continuous action: steering target in [−0.30, 0.30] rad and pedal in [−1, 1] (negative = brake). Discrete actions become special cases, so the planner and the physics stay the same.
- **Continuous System One.** An ensemble of K = 5 small MLPs, each trained with a mean-squared-error loss on the planner's chosen continuous action, from different initialisations and shuffles. It acts with the ensemble mean. Its confidence is a monotone function of the ensemble's disagreement, calibrated on validation data. Its cost is K units per decision (one forward pass per member).
- **Feasibility spike** (dev seeds only), with criteria fixed here, before measuring:
  1. **agreement** ≥ 85%: the fraction of dev states where the ensemble mean is within half a steering step (0.03 rad) of the planner's steering target and has the same pedal sign. This is the continuous analogue of the discrete agreement criterion;
  2. **error detection**: the ensemble disagreement separates disagreeing from agreeing states with AUROC ≥ 0.75;
  3. **alone**: the continuous student driving alone stays on track in ≥ 80% of dev episodes.

  If any fails, the change stops and reports, as before.
- **If the spike passes** (Phase B, same change): continuous players (student, hybrid with guard), DAgger training with regression labels, evaluation of continuous agreement and calibration, registry support for continuous games, the 5-run racing study and the racing demo integration (the pending tasks of `add-racing-game`, which is then archived with this change).
- **H4 for continuous games** is measured with the continuous agreement definition above. The target (≥ 95% above the confidence threshold) is unchanged and the definition is declared here, before any result.

Out of scope: converting the lander to continuous control (a follow-up, if racing succeeds), stochastic policies, reinforcement learning.

## Capabilities

### New Capabilities
- `continuous-policy`: the ensemble regressor with disagreement-based confidence, its training, calibration and serialization.

### Modified Capabilities
- `game-interfaces`: optional continuous-action contract for environments and teachers.
- `racing-env`: continuous actions in addition to the discrete commands.

## Impact

- New `src/nn/ensemble.ts`, MSE training support in `src/nn/mlp.ts`, and continuous types in `src/core/types.ts`. `src/games/racing/` gains continuous stepping and the teacher's continuous target.
- New `experiments/racing-continuous-feasibility.ts`.
- Phase B touches `src/hybrid`, `src/training`, `src/eval`, the registry and the demo. Its spec deltas are added to this change if the spike passes.
