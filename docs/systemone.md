# System One / System Two

Can a tiny network, trained from scratch by a slow planner, make most decisions at a fraction of the
planner's cost, and know when to hand control back? This experiment asks that question on five
environments: Snake, a lander, a multi-robot warehouse, a racing car and a 3D quadruped. It uses no ML
libraries: the environments, planners, networks, backprop and training loops are all written in
TypeScript, and everything runs in Node or in a browser tab.

- **System Two** is a slow, strong planner that acts as the teacher.
- **System One** is a small MLP (He initialization [18], trained with Adam [17]) that proposes a move
  with a confidence: a classifier of 5.5k–21k parameters for the discrete games (Snake, lander, warehouse).
  For continuous control it is an ensemble of five regressors, a simplified deep ensemble [22] (members
  trained with squared error, without predicted variances), whose disagreement sets the
  confidence: 5 × 5.6k parameters for racing, 5 × 79k for the quadruped.
- **Guard**: a cheap deterministic check on System One's proposed move.
- **Hybrid**: System One decides first. When its confidence is low, or when the guard rejects its
  move, the planner decides. During training, each escalated state becomes a new training example.

Live: <https://lab.emanuelestrazzullo.dev/systemone/>. The decision log is [EXPERIMENTS.md](../EXPERIMENTS.md).

## Background

The fast/slow framing comes from dual-process theory [1]. In machine learning its best-known form is
**expert iteration** [2]: a search-based "System 2" produces improved decisions, and a neural "System 1"
is trained to imitate them, as in AlphaGo Zero [3]. We use only the imitation half of that loop: our
planners are fixed algorithms and never use the network to guide their search, so System Two does not
improve as System One learns. Imitating an expert only on the expert's own
trajectories suffers from compounding errors [5]. We therefore label states that the *learner*
visits, as in **DAgger** [4]; unlike DAgger, which labels every visited state, the planner labels only
the states it is asked about (escalations, plus a small random audit of confident moves), as in
SafeDAgger [36]. Targets are the teacher's per-action scores turned into soft labels with a
temperature, as in knowledge and policy distillation [6, 7]. Distilling an expensive planner (MPC) into a
fast policy is an established pattern in robotics [15, 16].

Deciding *when* the cheap model should defer is studied as selective classification and learning to
defer [10, 11, 12]. It is also the logic of cost-aware cascades, from classic detectors to LLM
routing [19, 20]. Confidence is only useful if it is calibrated. We use temperature scaling and report
the expected calibration error (ECE) [8, 9].

For continuous control, the MPC-to-policy distillation of [16] and the end-to-end imitation of an MPC
expert with DAgger for agile driving [21] regress the controls directly; we follow them for racing. The
car uses the kinematic bicycle model common in autonomous-driving control [23, 24], its base controller is
pure pursuit [25], and planning for lap progress follows optimization-based racing [26].

The warehouse follows robotic fulfilment systems, where fleets of mobile robots carry shelves to pick
stations [27]. Keeping such a fleet moving is **lifelong multi-agent path finding** (MAPF) [28, 31]. Optimal
MAPF solvers such as conflict-based search [29] scale poorly with the number of robots, so real-time systems
plan in a bounded window, as in cooperative space-time search [30], and learned decentralised policies imitate
a centralised planner from each robot's local view [32, 33]. Our planner is a stateless variant of [30], and
our System One sees a local window, as in [32].

The guard plays the role of a **shield** in safe RL [13]: it sits between the policy and the environment
and blocks actions that fail a safety check. Unlike a shield, it is not synthesised from a formal
specification and guarantees nothing: it is a short simulation (one move for Snake, 0.2–1.1 s for the
physics games) or, for the warehouse, a rule check, and a rejected move goes to the planner instead of
being replaced by a safe one.

The planners of the lander, racing and the quadruped are **rollout algorithms** [14]: they score each
candidate action by simulating a hand-written base policy after it. Rollout's guarantee of doing no worse
than the base policy needs an exact model and rollouts to the end of the episode. The lander's planner
has both, so it lands whenever the autopilot would (its 1-point satisficing margin can only cost fuel
bonus). The racing and quadruped planners look ahead only a few seconds, so for them the improvement
over the base policy is measured, not guaranteed.

**Where the idea came from.** The project started from a demo by Simone Rizzo, "Rizzo Flow" [34], which
reproduces the interface of Jev, a "System One model" by TypeSafe AI [35]. Jev does not generate text: it
takes a state and typed questions (yes/no, choice, score) and returns answers with probabilities, which
its makers train to be calibrated. It is used inside LLM agents for fast decisions such as routing a
request or blocking a risky tool call. Rizzo Flow obtains the same kind of answer from an open 4B-parameter language model,
without training it, by reading the probabilities of the answer options after one forward pass, and uses
it to play Snake in real time from features computed by the game. Here the design is different in three
ways, so these experiments are not a reproduction of Jev:

- **Who teaches whom.** There, a general model is used as it is (Rizzo Flow) or trained by its makers
  (Jev), and the larger agent delegates decisions to it. Here System Two is the teacher: System One is
  trained from scratch to imitate it, decides first, and hands a decision back when it is unsure; every
  hand-back becomes a training example.
- **Scale and scope.** A general model that answers any question, against one network per task, with
  5 thousand to 400 thousand parameters, whose forward pass costs microseconds on a CPU.
- **Measurement.** Here the escalation threshold, the calibration and the cost are measured against
  targets fixed in advance, on held-out seeds.

What is shared is the form of the decision (a state in, a choice with probabilities out, no generated
text), the importance of calibration for deciding when to defer, and the use of a cheap check that blocks
risky actions.

## Protocol

- **Targets set in advance.** The hypotheses and their thresholds were written before any experiment
  and were never changed:
  - H1: escalation falls during training and settles below 10%;
  - H2: the hybrid reaches ≥ 90% of the planner's score at ≥ 10× lower mean cost per move;
  - H3: System One alone reaches ≥ 60% of the planner's score;
  - H4: above the 0.9 confidence threshold, System One agrees with the planner at least 95% of the time.
- **Seed splits, enforced in code** (`src/eval/seeds.ts`, published in `artifacts/eval-seeds.json`):
  - **test** (1–200) is used only for the final studies below;
  - **dev** (10,001–10,200) is for every design decision, ablation and experiment;
  - **training** episodes use seeds ≥ 1,000,000.

  The evaluation commands default to dev and refuse test unless it is asked for explicitly.
- **Five training runs per game.** Each run uses a different training seed (network initialisation,
  shuffling, audit and training episodes). Every number below is the mean across the 5 runs ± the half-width
  of a 95% Student-t interval; the hypotheses are judged on the mean, and the table shows in how many
  single runs each one holds. Planner-only conditions do not depend on the network, so they are
  evaluated once.
- **Cost** is counted in hardware-independent compute units. A planner or guard unit is a search node
  expanded (Snake, warehouse) or a physics step simulated (lander, racing, quadruped); a network forward
  pass counts as 1, so a five-network ensemble costs 5. Units are comparable within a game, not across
  games.
- **Everything is seeded and reproducible.** The same configuration produces byte-identical weights, and
  the experiment scripts are deterministic (both are tested).
- **Conditions** (all on the same seeds): random; planner alone at three cost levels; System One alone;
  hybrid at confidence thresholds 0.5–0.95, with max-probability and margin confidence (discrete games) or
  the ensemble's calibrated confidence (racing, quadruped), with and without the guard; guard only
  (threshold 0); and hand-written baselines (the lander's autopilot, the warehouse's greedy robots, the
  base controllers of racing and the quadruped).
- **Intervals.** Across-run intervals, the ones reported, use Student's t with 4 degrees of freedom.
  Within-run intervals, stored only in the JSON files, use the normal approximation (1.96).
- **Quadruped evaluation.** Agreement and calibration are measured on every 4th decision of each episode,
  starting with the first (every decision for the other games); scores, costs and escalation use every
  decision.
- **Every claim has a source.** Main results come from `pnpm study`. Supporting claims come from
  `pnpm exp <name>`, which runs on dev seeds. [EXPERIMENTS.md](../EXPERIMENTS.md) logs every design
  decision, the evidence it rested on and how it was re-validated.

## Results

5 training runs × 200 test seeds per game. Apple M4 Max (16 cores, 48 GB), Node 22.21.1. The quadruped's
study is still running; its results will be added here, and until then it has no row below.
Full data: `artifacts/<game>/study/study-test-200.json` (generated by `pnpm study --game <game> --split test`).

### Snake (20×20, planner = BFS + tail safety + 1-step lookahead)

17,283 parameters (90.8 KB), 7×7 egocentric view, about 104 s of training per run. Score = food eaten
(max 397). Planner reference: 383.9 points at 1,018 units per move.

| Condition | Score | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| System One alone | 34.9 ± 1.6 | 9% | 1 | – | – |
| Hybrid, no guard @ 0.9 | 92.5 ± 4.0 | 24% | 939 ± 99 | 1.1× | 18.3% |
| Hybrid, no guard @ 0.95 | 119.8 ± 6.2 | 31% | 1,525 ± 193 | 0.7× | 33.9% |
| Guard only | 350.2 ± 34.5 | 91% | 49 ± 4 | 20.7× | 1.5% |
| **Hybrid + guard @ 0.5** | **356.9 ± 20.6** | **93%** | **57 ± 3** | **17.7×** | 1.8% |
| **Hybrid + guard @ 0.7** | **375.0 ± 1.7** | **98%** | **111 ± 7** | **9.2×** | 4.7% |
| Hybrid + guard @ 0.9 | 379.5 ± 2.1 | 99% | 272 ± 21 | 3.7× | 16.3% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 17.2% → 16.6% | not confirmed | 0/5 runs |
| H2 | hybrid + guard @ 0.5: 93.0% of the score at 17.7× lower cost | **confirmed** | 4/5 runs |
| H3 | 9.1% | not confirmed | 0/5 runs |
| H4 | 97.8% agreement, ECE 0.009 | **confirmed** | 5/5 runs |

### Lander (2D physics, planner = rollout algorithm over an autopilot)

5,508 parameters (29.5 KB), 16 egocentric inputs, about 53 s of training per run. Score = 100 + fuel bonus
(≤ 50) for a landing, else 0. Planner reference (tree depth 2): 128.7 points, 195/200 landings,
11,491 units per move.

| Condition | Score | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| **Hand-written autopilot** | **121.9** | **95%** | **1** | – | – |
| System One alone | 110.0 ± 12.8 | 85% | 1 | – | – |
| Guard only | 113.3 ± 8.5 | 88% | 69 ± 2 | 166× | 0.9% |
| Hybrid, no guard @ 0.5 | 116.7 ± 4.5 | 91% | 1,138 ± 183 | 10.1× | 14.1% |
| Hybrid + guard @ 0.7 | 120.7 ± 1.7 | 94% | 4,048 ± 361 | 2.8× | 40.1% |
| Hybrid + guard @ 0.9 | 127.9 ± 1.0 | 99% | 7,619 ± 527 | 1.5× | 69.9% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 97.4% → 73.1% | not confirmed | 0/5 runs |
| H2 | hybrid @ 0.5: 90.7% of the score at 10.1× lower cost | **confirmed, narrowly** | 4/5 runs |
| H3 | 85.5% | **confirmed** | 5/5 runs |
| H4 | 85.0% agreement, ECE 0.051 | not confirmed | 0/5 runs |

System One's score varies a lot between training runs (97.3 to 121.3); a single run would have been
misleading. The planner and the autopilot both land on 195 of the 200 seeds and leave the area on the other 5.

### Racing (continuous control, planner = rollout algorithm over pure pursuit)

System One is a deep ensemble of 5 × 5,634-parameter regressors (147.8 KB). It outputs continuous steering and
pedal, and costs 5 units per decision. Training takes about 270 s per run. Score = metres of track progress
in 60 s. Planner reference (horizon 4 s): 1,315 m at 5,820 units per move.

| Condition | Score (m) | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| Hand-written base controller | 1,095 | 83% | 1 | – | – |
| **System One alone** | **1,314 ± 60** | **100%** | **5** | **1,164×** | – |
| **Guard only** | **1,341 ± 7** | **102%** | **60 ± 2** | **97×** | 0.0% |
| Hybrid + guard @ 0.7 | 1,346 ± 3 | 102% | 646 ± 61 | 9.0× | 10.4% |
| Hybrid + guard @ 0.9 | 1,311 ± 6 | 100% | 5,449 ± 433 | 1.1× | 93.5% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 98.9% → 91.2% | not confirmed | 0/5 runs |
| H2 | hybrid + guard @ 0.5: 101.9% of the score at 96.6× lower cost | **confirmed** | 5/5 runs |
| H3 | 99.9% | **confirmed** | 5/5 runs |
| H4 | above 0.9 in only 3 of 5 runs (on about 10% of decisions), with 83.4% agreement; never in the other 2 | not confirmed | 0/5 runs |

Racing did **not** pass its feasibility spike. The criteria were fixed in advance; the discrete student
reached only 80.5% imitation agreement, and the continuous student's disagreement detected its own errors
with an AUROC of only 0.55 (EXPERIMENTS.md, entries 12–17). It was integrated anyway, by the author's
decision, and is reported as it is. Longer planner horizons do not help here (1,325 → 1,315 → 1,308 m for
2 / 4 / 6 s). In one of the five runs, System One alone went off track on some seeds (1,232 m); the guard
restores it (1,332 m).

### Warehouse (lifelong multi-robot path finding, planner = cooperative space-time search)

16 robots on a 32×20 grid carry goods between shelves and stations for 300 timesteps. Each robot decides in
turn (wait, north, east, south, west), in an order that rotates every timestep; a move into a shelf, a claimed
cell or a swap is blocked and the robot waits. Score = deliveries per episode. System One: 20,677 parameters
(108.5 KB), a 9×9 window around the deciding robot plus goal and distance-map features, about 62 s of training
per run. The guard rejects blocked moves (1 unit) and moves into dead-end cells other than the goal (5 units).
Planner reference (search window 8): 106.3 deliveries at 527 units per move. Confidence is either the top
probability or the margin between the top two.

| Condition | Deliveries | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| Hand-written greedy baseline | 23.9 | 23% | 1 | – | – |
| Planner, window 4 | 60.1 | 57% | 115 | 4.6× | – |
| Planner, window 16 | 112.1 | 105% | 2,368 | 0.2× | – |
| System One alone | 39.2 ± 4.8 | 37% | 1 | – | – |
| Guard only | 47.1 ± 5.4 | 44% | 8 ± 2 | 69× | 1.2% |
| Hybrid + guard, margin @ 0.5 | 71.6 ± 4.6 | 67% | 53 ± 7 | 9.9× | 9.1% |
| Hybrid + guard, margin @ 0.7 | 86.6 ± 3.4 | 81% | 91 ± 9 | 5.8× | 15.2% |
| **Hybrid + guard, top probability @ 0.9** | **93.6 ± 3.0** | **88%** | **129 ± 9** | **4.1×** | 21.5% |
| Hybrid + guard, margin @ 0.9 | 97.9 ± 3.2 | 92% | 176 ± 15 | 3.0× | 29.9% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 26.4% → 22.9% | not confirmed | 0/5 runs |
| H2 | closest: hybrid + guard, margin @ 0.5: 67.4% of the score at 9.9× lower cost | not confirmed | 0/5 runs |
| H3 | 36.8% | not confirmed | 0/5 runs |
| H4 | 97.4% agreement, ECE 0.018 | **confirmed** | 5/5 runs |

The warehouse passed its pre-registered feasibility spike on dev seeds (EXPERIMENTS.md, entry 20), and then
missed H2 on the test study: no hybrid reaches 90% of the planner's score at a tenth of its cost. It is,
however, the environment where escalation adds the most over System One alone (37% → 88% of the planner at
4.1× lower cost). **At about the same cost, the hybrid beats the planner's own cheaper setting by a wide
margin**: 93.6 deliveries at 129 units per move, against 60.1 at 115 units for the
planner with a shorter window. Spending the planner's budget only on the decisions System One is unsure about
works better than spending a smaller budget on every decision.

In the spike, a comparable System One agreed with the planner on 93.9% of the dev states the planner
visited. In the study it agrees on only 76.2% of the states it reaches when it drives all 16 robots itself.
This is the compounding-error effect that motivates DAgger [4, 5], amplified by coupling: every robot's
mistake changes the other robots' states.

### What the numbers say: four regimes

The same pipeline, network family, hybrid and guard produce four different outcomes on the four completed
studies. Each is informative.

1. **Snake: the planner is needed, and the guard makes the hybrid safe.** System One alone is weak (9%),
   because a 7×7 window cannot see global traps. Confidence measures ambiguity, not stakes, and on dev seeds
   20 of 30 unguarded deaths were sealed by a confident move against the planner (`pnpm exp snake-deaths`).
   A shield-style check [13] closes that gap: 93–98% of the planner's score at 9–18× lower cost
   (`pnpm exp snake-guard-ablation`). Richer inputs add ~10 points to System One alone and do not help the
   unguarded hybrid (95 → 83 points; `pnpm exp snake-inputs`). Calibration is excellent (ECE 0.009).
2. **Lander: a hand-written rule is enough.** System One reaches 85% of the planner, but the autopilot
   that the planner uses as its base policy scores higher at the same cost. The autopilot is bang-bang: it
   alternates "none" and "main engine" on 60% of decisions, like PWM. Actions are therefore often
   equivalent, which caps agreement and confidence (`pnpm exp lander-imitation`, `lander-acceptability`).
3. **Racing: the student matches its teacher, and escalation is unnecessary.** Regressing continuous
   controls [16, 21] removes the equivalence problem. The ensemble drives as far as the discrete planner
   for ~1/1,000 of the cost and, with the guard, slightly further, while agreeing with it on only 51% of
   decisions. Its confidence is poorly calibrated (ECE 0.27), so "knowing when not to trust itself" fails
   here too, but this student rarely needs the planner.
4. **Warehouse: confidence works, and escalation is where the value is.** System One alone is weak (37%):
   a local window cannot anticipate congestion, and its errors compound across the fleet. Its confidence is
   well calibrated (ECE 0.018), so escalation goes to the right decisions, and the hybrid dominates the
   planner's own cost knob. It still falls short of the pre-registered 10× target (88% at 4.1×).

Across the four environments, **agreement with the teacher is a poor proxy for quality** whenever several
actions are equally good. The cheap guard is the most consistently useful component. The learned
confidence works as intended (H4) only where the planner's labels are unambiguous: Snake and the
warehouse, where one action is usually clearly best. The lander's planner breaks ties too, but many of its
actions are nearly equivalent, and racing's continuous actions have no single right answer.

### Limitations

- **Development-time contamination, now re-validated.** Before the splits existed, a few design
  decisions were checked on seeds 1–30, today's test split (entries 4, 9 and 10 in
  [EXPERIMENTS.md](../EXPERIMENTS.md)). All of them were re-run on dev seeds with committed scripts. The
  decisions hold. One number did not: a death analysis first reported 28/30 and is 20/30 on dev. The
  test split has since been used only for the final studies above.
- **Five runs give wide intervals** where the training variance is high (lander System One ± 12.8).
- **Design changes made during development** (planner tie-breaking, τ, lander physics and planner) are
  logged with their evidence in [EXPERIMENTS.md](../EXPERIMENTS.md) and the OpenSpec archive.
- **Strong or simple teachers.** Snake's planner nearly fills the board, and the lander's planner is
  built on a hand-written autopilot. The games are testbeds, not tasks that need a network.
- **Racing was integrated despite failing its pre-registered spike** (entries 14–17 in EXPERIMENTS.md).
  Its continuous System One uses a different model (a regression ensemble) and a different agreement
  definition (steering within 0.03 rad and the same pedal sign), both declared before measuring.
- **The warehouse is a grid abstraction**: unit-time moves, no kinematics, one layout and 16 robots. Its
  planner is windowed and prioritised, so it is fast but not optimal (unlike conflict-based search [29]).
- **Browser timings** are not reported here; cost is measured in compute units. Studies shared the
  machine with other studies and experiments, so wall-clock times (training times here and in the JSON
  files) are indicative only.


## Reproduce

Requires Node ≥ 22 and pnpm (`pnpm install` once).

```sh
# Final studies (5 training runs × 200 test seeds; resumable; evaluation on all cores but two)
pnpm study --game snake     --runs 5 --split test   # ~2 h
pnpm study --game lander    --runs 5 --split test   # ~45 min
pnpm study --game racing    --runs 5 --split test   # ~2.5 h
pnpm study --game warehouse --runs 5 --split test   # ~1 h
pnpm study --game quadruped --runs 5 --split test   # ~12 h

# Supporting experiments (dev seeds; results in artifacts/experiments/)
pnpm exp snake-deaths
pnpm exp snake-guard-ablation
pnpm exp snake-inputs          # ~6 min
pnpm exp lander-imitation      # ~4 min
pnpm exp lander-acceptability
pnpm exp racing-feasibility                    # discrete spike (v3)
pnpm exp racing-continuous-feasibility         # continuous spike
pnpm exp warehouse-feasibility
pnpm exp quadruped-solver
pnpm exp quadruped-margin
pnpm exp quadruped-feasibility                 # spike v2 (v1's result is kept)
pnpm exp quadruped-exploratory                 # post hoc, ~40 min on all cores

# Single model, day-to-day (dev split by default)
pnpm train:snake  && pnpm eval:snake
pnpm train:lander && pnpm eval:lander
pnpm bench:teacher && pnpm bench:lander          # planner benchmarks
```

Generic form: `pnpm train --game <name>` and `pnpm eval --game <name> [--split dev|test]`, with
options such as `--seeds 30`, `--levels 1,2`, `--threshold 0.9`, `--tau 0.1`, `--no-guard` and `--workers N`.

## The page

`/systemone/` runs every game in the registry with no backend:

- the live game, with every move colored by who decided it (System One, guard, System Two);
- System One's probabilities (or continuous action) against the confidence threshold;
- "How it works" (the mechanism and the meaning of the shares) and "This game" (task, network, inputs,
  outputs, planner, guard, published result);
- **Inside System One**, a 3D view (three.js) of the real forward pass behind the displayed decision.
  Hidden units are lit by their activations, and only the connections with the largest
  |weight × activation| are drawn (into the outputs, those into the chosen output and the runner-up);
- in-tab training in a Web Worker (not for the quadruped, whose training takes hours);
- the cost–quality frontier from the 5-run test study, with 95% intervals;
- visitor disturbances: extra wind on the lander, and pushes on the quadruped by dragging on its 3D view;
- video recording of the board.

The pretrained weights are run 1 of each study, a choice fixed in advance rather than the best run.

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
21. Pan, Y., Cheng, C.-A., Saigol, K., Lee, K., Yan, X., Theodorou, E., & Boots, B. (2018). Agile Autonomous Driving using End-to-End Deep Imitation Learning. *Robotics: Science and Systems (RSS) 2018*.
22. Lakshminarayanan, B., Pritzel, A., & Blundell, C. (2017). Simple and Scalable Predictive Uncertainty Estimation using Deep Ensembles. *NeurIPS 30*.
23. Kong, J., Pfeiffer, M., Schildbach, G., & Borrelli, F. (2015). Kinematic and Dynamic Vehicle Models for Autonomous Driving Control Design. *IEEE Intelligent Vehicles Symposium (IV) 2015*.
24. Rajamani, R. (2012). *Vehicle Dynamics and Control* (2nd ed.). Springer.
25. Coulter, R. C. (1992). Implementation of the Pure Pursuit Path Tracking Algorithm. Carnegie Mellon University, Robotics Institute, CMU-RI-TR-92-01.
26. Liniger, A., Domahidi, A., & Morari, M. (2015). Optimization-based autonomous racing of 1:43 scale RC cars. *Optimal Control Applications and Methods*, 36(5), 628–647.
27. Wurman, P. R., D'Andrea, R., & Mountz, M. (2008). Coordinating Hundreds of Cooperative, Autonomous Vehicles in Warehouses. *AI Magazine*, 29(1), 9–20.
28. Stern, R., et al. (2019). Multi-Agent Pathfinding: Definitions, Variants, and Benchmarks. *Symposium on Combinatorial Search (SoCS) 2019*.
29. Sharon, G., Stern, R., Felner, A., & Sturtevant, N. R. (2015). Conflict-based search for optimal multi-agent pathfinding. *Artificial Intelligence*, 219, 40–66.
30. Silver, D. (2005). Cooperative Pathfinding. *AAAI Conference on Artificial Intelligence and Interactive Digital Entertainment (AIIDE) 2005*.
31. Li, J., Tinka, A., Kiesel, S., Durham, J. W., Kumar, T. K. S., & Koenig, S. (2021). Lifelong Multi-Agent Path Finding in Large-Scale Warehouses. *AAAI 2021*.
32. Sartoretti, G., Kerr, J., Shi, Y., Wagner, G., Kumar, T. K. S., Koenig, S., & Choset, H. (2019). PRIMAL: Pathfinding via Reinforcement and Imitation Multi-Agent Learning. *IEEE Robotics and Automation Letters*, 4(3), 2378–2385.
33. Ma, Z., Luo, Y., & Ma, H. (2021). Distributed Heuristic Multi-Agent Path Finding with Communication. *ICRA 2021*.
34. Rizzo, S. (2026). Rizzo Flow. Post and demo on LinkedIn.
35. Runkle, S., & Lovell, H. (2026, September 17). Building a Harness with Jev. *LangChain Blog*. https://www.langchain.com/blog/building-a-harness-with-jev
36. Zhang, J., & Cho, K. (2017). Query-Efficient Imitation Learning for End-to-End Simulated Driving. *AAAI 2017*.
