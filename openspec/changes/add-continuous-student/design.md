# Design

## Context

See proposal.md. The discrete pipeline stays as it is for Snake and the lander. This change adds a continuous path, starting with racing, gated by a feasibility spike.

## Decisions

### Continuous racing actions
`stepContinuous([steerTarget, pedal])`:
- the steering target is clamped to ±0.30 and followed by the same servo;
- the pedal p is clamped to [−1, 1]: acceleration = p·gas·(1 − v/vmax) when p ≥ 0, else p·brake;
- drag and friction cap are unchanged.

The discrete command a maps to `[clamp(target ± step), ±1]`. A single internal step function takes (steerTarget, pedal), so both paths share the physics exactly.

### Teacher target
The racing teacher already chooses among discrete commands. `targetAction(env)` returns the continuous equivalent of its argmax: the steering target that command produces and the pedal ±1. The pedal label is therefore bang-bang. A regressor on bang-bang pedal labels learns the local duty cycle, which is exactly the proportional pedal a continuous controller would use. The agreement criterion only asks for the pedal sign.

### Ensemble
- K = 5 MLPs, 20 → 64 → 64 → 2, linear outputs.
- Targets normalised by the action ranges (steering / 0.30, pedal as is).
- MSE loss, Adam with lr 1e-3, mini-batches of 64; member k uses seed `seed·31 + k` for initialisation and shuffling.
- Implemented by generalising `Mlp.accumulateGradient` to a `loss: 'softmax-ce' | 'mse'` option. The MSE gradient on the logits is `(output − target) / dim`.

### Confidence
- disagreement d = mean over dimensions of the members' std, each normalised by the dimension's range;
- confidence c(d) = isotonic-style monotone fit of P(agree | d), estimated on a validation split by binning d into 10 quantile bins and taking the running minimum from low to high d, so the result is monotone non-increasing.

### Spike
`experiments/racing-continuous-feasibility.ts`:
- data from planner-driven training episodes plus 2 DAgger rounds (the ensemble drives, the planner labels every visited state), since imitation on the planner's own distribution alone is known to compound errors (Ross et al., 2011);
- criteria 1–2 on 10 dev episodes driven by the planner;
- criterion 3 on 20 dev episodes driven by the ensemble alone;
- the criteria and thresholds are those of proposal.md.

## Risks / Trade-offs

- [Agreement tolerance of half a steering step is tight] → it mirrors the discrete criterion (the same command). It was fixed before measuring and is not relaxed afterwards.
- [Ensemble cost of 5 units] → still more than 1,000× below the planner (~10,000 units).
- [Bang-bang pedal labels] → only the sign is compared. The student's proportional pedal is a different, smoother policy, and its quality shows in criterion 3 and later in the study.
