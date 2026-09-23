# System One in the browser

An experiment on a question: can a tiny, vertical neural network, trained from scratch by an algorithmic
planner, make most decisions at a fraction of the planner's cost and know when not to trust itself?

- **System Two** is a slow, strong planner (the teacher).
- **System One** is a micro-MLP written from scratch in TypeScript, with no ML libraries. It decides
  first. When its confidence is low, or when a cheap **guard** rejects its move, the hybrid escalates
  to System Two, and the escalated state becomes a new training example (expert iteration / DAgger).

This repository currently contains the **headless Snake pipeline**: environment, planner, network,
hybrid, three-phase training and evaluation, all running in Node. Library code in `src/` has no Node
dependencies, so it can later move into a Web Worker for the browser demo.

The work is tracked with [OpenSpec](https://github.com/Fission-AI/OpenSpec). The main specs are in
`openspec/specs/`; the changes, with proposal, design and tasks, are in `openspec/changes/`
(completed ones under `archive/`).

## Commands

Requires Node ≥ 22 and pnpm.

```sh
pnpm install
pnpm typecheck
pnpm test            # unit tests, including gradient checking and reproducibility
pnpm train:snake     # ~2 min: writes artifacts/snake/weights.json and train-log.jsonl
pnpm eval:snake      # ~20 min: 200 fixed seeds, writes artifacts/snake/eval-report.json
pnpm bench:teacher   # planner quality and time per decision at lookahead depth 0/1/2
```

Browser demo (static site, no backend):

```sh
pnpm dev             # local dev server
pnpm build           # static site in dist/ (works from any path)
pnpm preview         # serve dist/ locally
pnpm demo:data       # refresh web/public/data/ from artifacts/snake/ after retraining or re-evaluating
```

The page plays Snake live with the hybrid and colors every move by who decided it: System One,
the guard stopping System One, or System Two on low confidence. It shows System One's probabilities
against the confidence threshold. You can load the pretrained weights, or train from scratch in a Web
Worker in about two minutes, and the live game picks up each new version of the weights as it arrives.
It also plots the cost–quality frontier of the published evaluation and can record the board as a video.

Useful options:

- `pnpm train:snake --iterations 30 --tau 0.1 --threshold 0.9 --audit 0.02 --depth 1 --seed 1`
- `pnpm eval:snake --seeds 30 --levels 0,1` for a quick run; `--no-guard` on either script disables the guard.

## Layout

```
src/core/         Env / Teacher / Student / Player contracts, seeded PRNG, statistics
src/games/snake/  20x20 Snake, 7x7 egocentric encoding (201 values), BFS planner, tail-reachability guard
src/nn/           MLP, backprop, Adam, soft labels, temperature scaling, ECE, serialization
src/hybrid/       confidence measures, System One / System Two / hybrid (with optional guard) players
src/training/     replay dataset with dedup, bootstrap → escalation loop → consolidation
src/eval/         conditions, runner, hypothesis checks, report
scripts/          Node CLIs (the only place Node APIs are used)
web/              demo page: game view, bars, charts, frontier, recorder, training worker
artifacts/        eval-seeds.json (committed); generated weights, logs and reports (ignored)
```

## Architecture: three tiers

1. **System One** (1 unit): one forward pass of the micro-MLP proposes a move with a confidence.
2. **Guard** (~50–60 units on average, counted): if System One is confident, a cheap deterministic
   check verifies the proposed move only. For Snake it simulates the move and runs one early-exit BFS
   to confirm the tail is still reachable. The guard is a fragment of the planner, run on a single action.
3. **System Two** (~1,000 units): the planner runs only when confidence is low or the guard rejects.

Why the guard exists: without it, the hybrid scored 85 against the teacher's 384. In 28 of 30 analyzed
deaths, the last point where the teacher could still save the game was a move that System One played
confidently (≥ 0.9) against the teacher's choice. Confidence measures ambiguity, not stakes. Richer
inputs (11x11 window, body age, tail direction, obstacle rays) and a learned risk head helped only
marginally (+11 and +30 points).

## Results

Measured on an Apple M4 Max (16 cores, 48 GB), Node 22.21.1, on 200 fixed evaluation seeds (1–200).
Training seeds start at 1,000,000 and do not overlap with them. Score = food eaten (maximum 397).
Cost is measured in compute units: planner or guard nodes expanded, with one network forward pass = 1.

**Model:** 17,283 parameters, 90.8 KB of JSON weights, calibration temperature 1.12, trained in 105 s with
the guard enabled (5 bootstrap episodes + 30 escalation iterations at threshold 0.9 + consolidation).

| Condition | Score (±95%) | % of teacher | Cost / move | Teacher/hybrid cost | µs / move | Escalated (guard) |
| --- | --- | --- | --- | --- | --- | --- |
| Random | 0.2 ± 0.1 | 0% | 0 | – | 0.1 | – |
| System Two, depth 0 | 375.5 ± 4.1 | 98% | 309 | – | 5.3 | – |
| **System Two, depth 1 (teacher)** | **383.9 ± 2.1** | 100% | 1,018 | 1x | 16.7 | – |
| System Two, depth 2 | 383.5 ± 2.4 | 100% | 2,727 | – | 42.4 | – |
| System One alone | 36.0 ± 1.7 | 9% | 1 | – | 6.4 | – |
| Hybrid, no guard, max-prob @ 0.95 | 116.0 ± 6.6 | 30% | 1,271 | 0.8x | 24.2 | 28.6% |
| Guard only (threshold 0) | 300.9 ± 13.6 | 78% | 55 | 18.5x | 9.1 | 1.3% (1.3%) |
| Hybrid + guard, max-prob @ 0.5 | 330.4 ± 11.8 | 86% | 60 | 17.0x | 8.2 | 1.6% (1.3%) |
| **Hybrid + guard, max-prob @ 0.7** | **375.6 ± 3.5** | **98%** | **106** | **9.6x** | 8.9 | 4.3% (0.8%) |
| Hybrid + guard, max-prob @ 0.8 | 378.2 ± 3.3 | 99% | 147 | 6.9x | 9.6 | 7.0% (0.6%) |
| Hybrid + guard, max-prob @ 0.9 | 377.4 ± 3.9 | 98% | 251 | 4.1x | 11.3 | 14.6% (0.3%) |
| Hybrid + guard, margin @ 0.9 | 382.7 ± 2.9 | 100% | 382 | 2.7x | 13.3 | 24.5% (0.1%) |

The full table, with every threshold and measure with and without guard, is in
`artifacts/snake/eval-report.json`.

### Hypotheses (targets unchanged from the design document)

| | Target | Measured | Outcome |
| --- | --- | --- | --- |
| H1 escalation falls and settles | < 10% during training | 16.0% → 14.4% (training at threshold 0.9) | not confirmed |
| H2 efficient hybrid | ≥ 90% of teacher score at ≥ 10x lower cost/move | hybrid + guard @ 0.7: 97.8% at 9.6x | not confirmed (just short) |
| H3 pure intuition | System One alone ≥ 60% of teacher | 9.4% | not confirmed |
| H4 calibration | ≥ 95% agreement above threshold 0.9 | 97.4%, ECE 0.009 | **confirmed** |

### What the numbers say

- **Snake works.** With the guard, the hybrid plays at 98% of the teacher's score while spending about
  a tenth of its compute per move. It escalates on 4.3% of the moves, and the guard catches the traps
  that confidence misses.
- **The cost/quality frontier straddles the H2 target.** At threshold 0.7: 97.8% of the score at 9.6x.
  At 0.5: 86% at 17x. The target region (≥ 90% and ≥ 10x) lies between two measured thresholds. We did
  not add thresholds after the fact to land inside it.
- **Intuition alone is still myopic.** System One alone reaches 9% of the teacher: a 7x7 window cannot
  see global traps. The guard is what makes the hybrid safe, and its cost is reported (12–34% of the
  total at the useful thresholds).
- **Calibration holds.** When System One is confident, it agrees with the planner 97–99% of the time,
  with an ECE below 0.01.
- **H1 depends on the training threshold.** Training at 0.9 settles at ~15% escalation, because guarded
  games now last to the crowded end-game, where the planner is needed most. Evaluation shows 4.3% at 0.7.

Earlier fixes, recorded in the OpenSpec archive: deterministic tie-breaking in the planner (it removed
50/50 labels that stalled escalation around 65%), and a lookahead bug that made the planner avoid food.

## Reproducibility

Everything is seeded. The same configuration and seed produce byte-identical weights (tested), and
`Math.random` is banned from `src/` (tested). Wall-clock time is logged but never drives decisions.
