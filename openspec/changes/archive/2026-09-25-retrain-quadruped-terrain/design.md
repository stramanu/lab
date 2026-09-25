# Design

## Decisions (fixed before any measurement of this study)

### Training (5 runs)

For run k (1–5):
- **Start:** `artifacts/quadruped/study/run-k/weights.json`, the published flat network of the same run.
- **Training seeds:** from 3,000,000 + (k − 1) · 100,000. These are new episodes, disjoint from the flat
  study's seeds.
- **Environment:** terrain `varied`, with the calibrated parameters (hills up to 16°, 1 branch per metre),
  pushes as in training (8 N·s).
- **Pipeline:** the flat study's settings except the bootstrap size and epochs, which are reduced because
  this is fine-tuning:
  - bootstrap: 100 planner-driven episodes, 4 epochs;
  - escalation: 5 iterations of at most 4,000 moves, retraining every 2,000 new examples for 2 epochs;
  - threshold 0.9 with the guard; consolidation 5 epochs; planner level 2.
- **Parallelism:** bootstrap episodes are generated on worker threads, and the 5 runs train in parallel,
  one thread each. The result does not depend on this.

### Evaluation (test split)

- **Seeds and terrains:** test seeds 1–100, on flat and on mixed terrain (hills and branches), with pushes.
- **Networks:** the old (flat) and the new (fine-tuned) network of each run.
- **Conditions:** System One alone, guard only, hybrid + guard at 0.7 and at 0.9, and the planner
  (level 2, evaluated once per terrain).
- **Measures:** distance, falls, cost per move, escalation, and agreement with the planner (every 4th
  decision, as in the study).

### Targets (judged on the mean of the 5 runs; the report also gives how many runs meet each)

- **T1, learning:** on mixed terrain, the new System One alone reaches at least 90% of the planner's
  distance.
- **T2, no forgetting:** on flat ground, the new System One alone reaches at least 95% of the old one's
  distance.
- **T3, less help needed:** on mixed terrain, the new hybrid + guard at 0.9 escalates less than the old one.
- **T4, cheaper hybrid:** on mixed terrain, the new hybrid + guard at 0.7 reaches at least 95% of the
  planner's distance at a lower cost per move than the old one.

## Risks / Trade-offs

- **Fewer bootstrap episodes than the flat study (100 against 400).** Chosen to fit one night; it is
  fine-tuning from a network that already walks.
- **Old and new networks are compared on the same seeds, but only 100 per terrain, to fit the compute
  budget.**
