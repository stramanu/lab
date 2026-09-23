# System One in the browser

Can a tiny network, trained from scratch by a slow planner, make most decisions at a fraction of the
planner's cost, and know when to hand control back? This repository is an open, reproducible experiment
on that question. It covers two games and uses no ML libraries: the environments, planners, network,
backprop and training loop are all written in TypeScript, and everything runs in Node or in a browser tab.

- **System Two** is a slow, strong planner that acts as the teacher.
- **System One** is a micro-MLP (5k–17k parameters, He initialization [18], trained with Adam [17]).
  It proposes a move with a confidence.
- **Guard**: a cheap deterministic check on System One's proposed move.
- **Hybrid**: System One decides first. When its confidence is low, or when the guard rejects its
  move, the planner decides, and the escalated state becomes a new training example.

## Background

The fast/slow framing comes from dual-process theory [1]. In machine learning it maps onto
**expert iteration** [2]: a search-based "System 2" produces improved decisions, and a neural "System 1"
is trained to imitate them, as in AlphaGo Zero [3]. Imitating an expert only on the expert's own
trajectories suffers from compounding errors [5]. We therefore label the states that the *learner*
visits, as in **DAgger** [4]. Targets are the teacher's per-action scores turned into soft labels with a
temperature, as in knowledge and policy distillation [6, 7]. Distilling an expensive planner (MPC) into a
fast policy is an established pattern in robotics [15, 16].

Deciding *when* the cheap model should defer is studied as selective classification and learning to
defer [10, 11, 12]. It is also the logic of cost-aware cascades, from classic detectors to LLM
routing [19, 20]. Confidence is only useful if it is calibrated. We use temperature scaling and report
the expected calibration error (ECE) [8, 9].

The guard is a **shield** in the sense of safe RL [13]: a verifier that sits between the policy and the
environment and blocks actions that fail a safety check. The lander's planner is a **rollout
algorithm** [14]: lookahead over a base policy, which by construction does no worse than the base policy.

The original motivation was a post showing a general 4B LLM used as a "System One". Here we ask the
complementary question: what if System One is a tiny, vertical model trained for one task?

## Protocol

- **Targets set in advance.** The hypotheses and their thresholds were written before any experiment
  and were never changed:
  - H1: escalation falls during training and settles below 10%;
  - H2: the hybrid reaches ≥ 90% of the planner's score at ≥ 10× lower mean cost per move;
  - H3: System One alone reaches ≥ 60% of the planner's score;
  - H4: above the 0.9 confidence threshold, System One agrees with the planner at least 95% of the time.
- **Seeds.** Evaluation uses 200 fixed seeds (1–200, `artifacts/eval-seeds.json`). Training uses seeds
  from 1,000,000 upward. Planner benchmarks and tuning use other ranges (5000+, 6000+, 7000+, 8000+).
- **Cost** is counted in hardware-independent compute units. Planner and guard units are nodes expanded
  (Snake) or physics steps simulated (lander); a network forward pass counts as 1. Wall-clock µs are
  reported alongside.
- **Everything is seeded.** The same configuration produces byte-identical weights (tested).
- **Conditions** (all on the same seeds): random; planner alone at three cost levels; System One alone;
  hybrid at confidence thresholds 0.5–0.95, with max-probability and margin confidence, with and without
  the guard; guard only (threshold 0); and, for the lander, a hand-written autopilot baseline.

## Results

Hardware: Apple M4 Max (16 cores, 48 GB), Node 22.21.1. There is one training run per game (see Limitations).
Full reports: `artifacts/<game>/eval-report.json` (generated; `web/public/data/` holds the published Snake copy).

### Snake (20×20, planner = BFS + tail-safety + 1-step lookahead)

Model: 17,283 parameters (90.8 KB), 7×7 egocentric view, trained in 105 s. Score = food eaten (max 397).

| Condition | Score (±95%) | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated (guard) |
| --- | --- | --- | --- | --- | --- |
| Planner (teacher) | 383.9 ± 2.1 | 100% | 1,018 | 1× | – |
| System One alone | 36.0 ± 1.7 | 9% | 1 | – | – |
| Hybrid, no guard @ 0.95 | 116.0 ± 6.6 | 30% | 1,271 | 0.8× | 28.6% |
| Guard only | 300.9 ± 13.6 | 78% | 55 | 18.5× | 1.3% (1.3%) |
| **Hybrid + guard @ 0.7** | **375.6 ± 3.5** | **98%** | **106** | **9.6×** | 4.3% (0.8%) |
| Hybrid + guard @ 0.9 | 377.4 ± 3.9 | 98% | 251 | 4.1× | 14.6% (0.3%) |

H1 ✗ (16.0% → 14.4%) · H2 ✗ just short (97.8% at 9.6×) · H3 ✗ (9.4%) · **H4 ✓** (97.4%, ECE 0.009).

### Lander (2D physics, planner = rollout algorithm over an autopilot)

Model: 5,508 parameters (29.5 KB), 16 egocentric inputs, trained in 52 s. Score = 100 + fuel bonus
(≤ 50) for a landing, else 0. Planner reference = tree depth 2.

| Condition | Score (±95%) | Landed | % of planner | Cost / move | Planner cost ÷ condition cost |
| --- | --- | --- | --- | --- | --- |
| Planner (teacher, depth 2) | 128.7 ± 3.0 | 195/200 | 100% | 11,491 | 1× |
| **Hand-written autopilot** | **121.9 ± 2.9** | **195/200** | **95%** | **1** | – |
| System One alone | 119.7 ± 4.8 | 185/200 | 93% | 1 | – |
| Guard only | 116.8 ± 5.5 | 180/200 | 91% | 68 | 168× |
| Hybrid + guard @ 0.9 | 128.7 ± 3.0 | 195/200 | 100% | 7,088 | 1.6× |

H1 ✗ (98% → 72%) · **H2 ✓** (guard only: 90.7% at 168×, a narrow margin) · **H3 ✓** (93%) · H4 ✗ (83.5%).
The same 5 seeds end out of bounds for every condition, the planner included.

### What the numbers say

- **Snake: the method works, but only with the guard.** A confident System One fails exactly on the
  rare states where a mistake is fatal. In 28 of 30 analysed deaths, the fatal move was a confident
  disagreement with the planner. Confidence measures ambiguity, not stakes; a shield-style check [13]
  closes that gap at ~50 units per move.
- **Lander: the student flies well alone, but a hand-written controller is as good for free.**
  System One lands 92.5% on its own (H3 holds). Yet the autopilot that the planner itself uses as base
  policy scores higher at the same cost. On this task, distillation does not beat a simple rule.
- **Agreement is the wrong metric when actions are equivalent.** The lander's autopilot is bang-bang:
  "none" and "main engine" often have the same effect, and which one is chosen is only a matter of
  phase. System One agrees with the planner only 43% of the time yet lands 92.5%. This caps confidence,
  inflates escalation (H1 fails) and makes H4 fail by construction. Set-valued targets and "learning to
  defer" losses [11, 12] address this; a prototype acceptability head was not enough (see the design
  notes).
- **Calibration holds where labels are unambiguous.** On Snake, ECE is below 0.01 above threshold.

### Limitations and deviations (read before citing numbers)

- **Test-set contamination during development.** Some design decisions were checked on evaluation seeds
  1–30: the input-variant comparison and the guard prototype on Snake, and quick lander checks. The
  effects involved are large (e.g. 84 → 375 points on Snake), but a clean protocol would have used a
  separate development set. A follow-up will re-validate these decisions on dedicated development
  seeds.
- **One training run per game.** Confidence intervals cover evaluation seeds, not training randomness.
  Multi-seed training is planned.
- **Tuned on the fly, disclosed.** Planner tie-breaking, τ and the lander's physics and planner design
  were changed after measuring them on non-evaluation seeds. Each change and its reason is recorded in
  the OpenSpec archive (`openspec/changes/archive/*/design.md`).
- **Strong or simple teachers.** Snake's planner nearly fills the board, and the lander's planner is
  built on a hand-written autopilot. Both games are testbeds, not tasks that need a network.

## Reproduce

Requires Node ≥ 22 and pnpm.

```sh
pnpm install
pnpm typecheck && pnpm test        # unit tests: gradient checking, determinism, reproducibility, …
pnpm train:snake  && pnpm eval:snake     # ~2 min + ~20 min
pnpm train:lander && pnpm eval:lander    # ~1 min + ~10 min
pnpm bench:teacher                 # Snake planner at depth 0/1/2
pnpm bench:lander                  # lander planner at depth 1/2/3, autopilot, random
```

Generic form: `pnpm train --game <name>` and `pnpm eval --game <name>`, with options such as
`--seeds 30`, `--levels 1,2`, `--threshold 0.9`, `--tau 0.1` and `--no-guard`.

### Browser demo

```sh
pnpm dev            # local dev server
pnpm build          # static site in dist/ (works from any path)
pnpm preview        # serve dist/
pnpm demo:data      # refresh web/public/data/ from artifacts/snake/
```

The page plays Snake live and colors every move by who decided it. It shows System One's probabilities
against the threshold, trains from scratch in a Web Worker in about two minutes while the game picks up
each new version of the weights, plots the published cost–quality frontier, and records the board as
video. The lander is not in the demo yet.

## Layout

```
src/core/         Env / Teacher / Student / Guard / Player contracts, seeded PRNG, statistics
src/games/        registry.ts, snake/ (env, 7×7 encoding, BFS planner, guard), lander/ (physics, autopilot, rollout planner, guard)
src/nn/           MLP, backprop, Adam, soft labels, temperature scaling, ECE, serialization
src/hybrid/       confidence measures and System One / System Two / hybrid players
src/training/     replay dataset, bootstrap → DAgger-style escalation loop → consolidation, worker session
src/eval/         conditions, runner, hypothesis checks, report
scripts/          Node CLIs (train, eval, benchmarks)
web/              browser demo
openspec/         specs (openspec/specs) and the history of every change, with design notes (openspec/changes/archive)
```

Specifications and design decisions are tracked with [OpenSpec](https://github.com/Fission-AI/OpenSpec).

## References

1. Kahneman, D. (2011). *Thinking, Fast and Slow*. Farrar, Straus and Giroux.
2. Anthony, T., Tian, Z., & Barber, D. (2017). Thinking Fast and Slow with Deep Learning and Tree Search. *NeurIPS 30*.
3. Silver, D., et al. (2017). Mastering the game of Go without human knowledge. *Nature*, 550, 354–359.
4. Ross, S., Gordon, G., & Bagnell, D. (2011). A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning. *AISTATS 2011*.
5. Ross, S., & Bagnell, D. (2010). Efficient Reductions for Imitation Learning. *AISTATS 2010*.
6. Hinton, G., Vinyals, O., & Dean, J. (2015). Distilling the Knowledge in a Neural Network. arXiv:1503.02531.
7. Rusu, A. A., et al. (2016). Policy Distillation. *ICLR 2016*.
8. Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). On Calibration of Modern Neural Networks. *ICML 2017*.
9. Naeini, M. P., Cooper, G., & Hauskrecht, M. (2015). Obtaining Well Calibrated Probabilities Using Bayesian Binning. *AAAI 2015*.
10. Geifman, Y., & El-Yaniv, R. (2017). Selective Classification for Deep Neural Networks. *NeurIPS 30*.
11. Madras, D., Pitassi, T., & Zemel, R. (2018). Predict Responsibly: Improving Fairness and Accuracy by Learning to Defer. *NeurIPS 31*.
12. Mozannar, H., & Sontag, D. (2020). Consistent Estimators for Learning to Defer to an Expert. *ICML 2020*.
13. Alshiekh, M., Bloem, R., Ehlers, R., Könighofer, B., Niekum, S., & Topcu, U. (2018). Safe Reinforcement Learning via Shielding. *AAAI 2018*.
14. Bertsekas, D. P., Tsitsiklis, J. N., & Wu, C. (1997). Rollout Algorithms for Combinatorial Optimization. *Journal of Heuristics*, 3, 245–262.
15. Levine, S., & Koltun, V. (2013). Guided Policy Search. *ICML 2013*.
16. Zhang, T., Kahn, G., Levine, S., & Abbeel, P. (2016). Learning Deep Control Policies for Autonomous Aerial Vehicles with MPC-Guided Policy Search. *ICRA 2016*.
17. Kingma, D. P., & Ba, J. (2015). Adam: A Method for Stochastic Optimization. *ICLR 2015*.
18. He, K., Zhang, X., Ren, S., & Sun, J. (2015). Delving Deep into Rectifiers: Surpassing Human-Level Performance on ImageNet Classification. *ICCV 2015*.
19. Viola, P., & Jones, M. (2001). Rapid Object Detection using a Boosted Cascade of Simple Features. *CVPR 2001*.
20. Chen, L., Zaharia, M., & Zou, J. (2023). FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance. arXiv:2305.05176.
