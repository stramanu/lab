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

The quadruped follows model-based legged locomotion. Controllers such as convex MPC on the MIT Cheetah 3 [40]
or sampling-based MPC through a physics simulator [41, 42] plan through a model at every step, and learned
policies are trained to reproduce such experts cheaply: MPC-Net distils an MPC into a network for the ANYmal
robot [43], and teacher–student training distils a privileged teacher into a deployable policy [44, 45]. Our
base controller is a hand-written trot with Raibert-style foot placement [37] and an open-loop gait clock,
simpler than the central pattern generators reviewed in [38]. Planner and network do not control the joints
directly: they modulate the trot, as in policies modulating trajectory generators [39]. The physics is the
deterministic build of the Rapier engine [46].

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

5 training runs × 200 test seeds per game. Apple M4 Max (16 cores, 48 GB), Node 22.21.1.
Full data: `artifacts/<game>/study/study-test-200.json` (generated by `pnpm study --game <game> --split test`).

**Corrected studies.** The Snake, lander and warehouse studies were re-run after a bug fix in the training
dataset: its deduplication had dropped some distinct states as duplicates (0.3% of Snake's training states,
0.1% of the lander's, 4.9% of the warehouse's; EXPERIMENTS.md, decisions 33 and 35). The numbers below are
the corrected ones. Two conclusions changed: H2 no longer holds for Snake and for the lander. Both had
passed narrowly in the first study, at the most aggressive setting, and the re-run shows they depended on
the training runs. The first study's results remain in git history.

### Snake (20×20, planner = BFS + tail safety + 1-step lookahead)

17,283 parameters (90.8 KB), 7×7 egocentric view, about 108 s of training per run. Score = food eaten
(max 397). Planner reference: 383.9 points at 1,018 units per move.

| Condition | Score | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| System One alone | 35.7 ± 2.2 | 9% | 1 | – | – |
| Hybrid, no guard @ 0.9 | 93.4 ± 6.9 | 24% | 980 ± 183 | 1.0× | 19.1% |
| Hybrid, no guard @ 0.95 | 120.0 ± 10.1 | 31% | 1,585 ± 228 | 0.6× | 35.1% |
| Guard only | 306.6 ± 75.9 | 80% | 54 ± 10 | 18.7× | 1.4% |
| Hybrid + guard @ 0.5 | 318.8 ± 74.2 | 83% | 65 ± 15 | 15.7× | 1.7% |
| **Hybrid + guard @ 0.7** | **374.5 ± 3.0** | **98%** | **116 ± 8** | **8.8×** | 4.7% |
| Hybrid + guard @ 0.9 | 381.2 ± 0.9 | 99% | 283 ± 34 | 3.6× | 16.1% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 16.7% → 15.4% | not confirmed | 0/5 runs |
| H2 | closest: hybrid + guard @ 0.5, 83.0% of the score at 15.7× lower cost | not confirmed | 2/5 runs |
| H3 | 9.3% | not confirmed | 0/5 runs |
| H4 | 97.8% agreement, ECE 0.008 | **confirmed** | 5/5 runs |

At thresholds of 0.5 or below, the result depends on the training run: the five runs score between 227
and 370 (guard only: 217 to 367), because in some runs games end early despite the guard. From 0.7 up, every run is within a few points of the planner: 97.5% of its score at 8.8×
lower cost, just short of the 10× target. The first study had passed H2 at 0.5 (93.0% at 17.7×, 4 of 5
runs); the re-run shows that this setting is not reliable.

### Lander (2D physics, planner = rollout algorithm over an autopilot)

5,508 parameters (29.4 KB), 16 egocentric inputs, about 53 s of training per run. Score = 100 + fuel bonus
(≤ 50) for a landing, else 0. Planner reference (tree depth 2): 128.7 points, 195/200 landings,
11,491 units per move.

| Condition | Score | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| **Hand-written autopilot** | **121.9** | **95%** | **1** | – | – |
| System One alone | 106.8 ± 5.5 | 83% | 1 | – | – |
| Guard only | 111.3 ± 3.9 | 86% | 71 ± 1 | 163× | 1.1% |
| Hybrid, no guard @ 0.5 | 113.6 ± 8.0 | 88% | 1,031 ± 107 | 11.1× | 13.2% |
| Hybrid, no guard @ 0.7 | 121.5 ± 2.4 | 94% | 3,828 ± 400 | 3.0× | 38.4% |
| Hybrid + guard @ 0.9 | 127.4 ± 1.3 | 99% | 7,326 ± 323 | 1.6× | 67.9% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 97.5% → 71.1% | not confirmed | 0/5 runs |
| H2 | closest: hybrid @ 0.5, 88.2% of the score at 11.1× lower cost | not confirmed | 2/5 runs |
| H3 | 82.9% | **confirmed** | 5/5 runs |
| H4 | 82.8% agreement, ECE 0.061 | not confirmed | 0/5 runs |

The first study had passed H2 narrowly (90.7%, 4 of 5 runs); the re-run misses it narrowly. Either way, no
hybrid beats the hand-written autopilot at a comparable cost. The planner and the autopilot both land on 195
of the 200 seeds and leave the area on the other 5.

### Racing (continuous control, planner = rollout algorithm over pure pursuit)

System One is an ensemble of 5 × 5,634-parameter regressors (147.8 KB). It outputs continuous steering and
pedal, and costs 5 units per decision. Training takes about 270 s per run. Score = metres of track progress
in 60 s. Planner reference (horizon 4 s): 1,315 m at 5,820 units per move. Racing does not use the
corrected dataset, so its study is unchanged.

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
(108.5 KB), a 9×9 window around the deciding robot plus goal and distance-map features, about 63 s of training
per run. The guard rejects blocked moves (1 unit) and moves into dead-end cells other than the goal (5 units).
Planner reference (search window 8): 106.3 deliveries at 527 units per move. Confidence is either the top
probability or the margin between the top two.

| Condition | Deliveries | % of planner | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- |
| Hand-written greedy baseline | 23.9 | 23% | 1 | – | – |
| Planner, window 4 | 60.1 | 57% | 115 | 4.6× | – |
| Planner, window 16 | 112.1 | 105% | 2,368 | 0.2× | – |
| System One alone | 42.7 ± 4.7 | 40% | 1 | – | – |
| Guard only | 52.8 ± 7.8 | 50% | 9 ± 2 | 61× | 1.5% |
| Hybrid + guard, margin @ 0.5 | 77.2 ± 6.6 | 73% | 59 ± 10 | 9.0× | 10.5% |
| **Hybrid + guard, margin @ 0.7** | **89.4 ± 6.2** | **84%** | **95 ± 13** | **5.5×** | 16.4% |
| Hybrid + guard, top probability @ 0.9 | 96.7 ± 2.9 | 91% | 132 ± 15 | 4.0× | 22.5% |
| Hybrid + guard, margin @ 0.9 | 100.1 ± 1.1 | 94% | 181 ± 20 | 2.9× | 31.2% |

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 32.6% → 21.2% | not confirmed | 0/5 runs |
| H2 | closest: hybrid + guard, margin @ 0.5, 72.6% of the score at 9.0× lower cost | not confirmed | 0/5 runs |
| H3 | 40.2% | not confirmed | 0/5 runs |
| H4 | 97.4% agreement, ECE 0.018 | **confirmed** | 5/5 runs |

The warehouse passed its pre-registered feasibility spike on dev seeds (EXPERIMENTS.md, entry 20), and then
missed H2 on the test study: no hybrid reaches 90% of the planner's score at a tenth of its cost. It is,
however, the environment where escalation adds the most over System One alone (40% → 91% of the planner at
4.0× lower cost). **With less compute than the planner's own cheaper setting, the hybrid delivers far
more**: 89.4 deliveries at 95 units per move, against 60.1 at 115 units for the planner with a shorter
window. Spending the planner's budget only on the decisions System One is unsure about works better than
spending a smaller budget on every decision. The correction of the training dataset (4.9% of its states had
been dropped) raised most conditions that use the network by a few deliveries (System One alone 39.2 →
42.7).

In the spike, a comparable System One agreed with the planner on 93.9% of the dev states the planner
visited. In the study it agrees on only 76.6% of the states it reaches when it drives all 16 robots itself.
This is the compounding-error effect that motivates DAgger [4, 5], amplified by coupling: every robot's
mistake changes the other robots' states.

### Quadruped (3D rigid-body physics, planner = rollout algorithm over a hand-written trot)

A 12-joint robot in Rapier's deterministic physics trots for 20 s while seeded pushes of 8 N·s hit its trunk
every 1.5–3 s, on a ground friction drawn per seed. Score = metres walked; a fall ends the episode. System One
is an ensemble of 5 × 78,852-parameter regressors (256 × 256 hidden units; 394,260 parameters, 2.1 MB) that
outputs 4 continuous modulations of the trot (0 = the plain trot) and costs 5 units per decision. Training
takes about 47 min per run (400 planner-driven bootstrap episodes, generated on 14 threads, then 5 escalation
iterations). Planner reference (level 2, 1 s rollouts): 9.1 m and 6 falls in 200 episodes at 4,099 units
per move. Agreement and calibration are measured on every 4th decision.

| Condition | Metres | % of planner | Falls / 200 | Cost / move | Planner cost ÷ condition cost | Escalated |
| --- | --- | --- | --- | --- | --- | --- |
| Hand-written trot | 5.1 | 56% | 67 | 1 | – | – |
| Planner, 0.5 s rollouts | 10.4 | 114% | 12 | 2,077 | 2.0× | – |
| Planner, 2 s rollouts | 9.2 | 102% | 2 | 7,986 | 0.5× | – |
| System One alone | 8.0 ± 0.2 | 88% | 12–23 | 5 | 820× | – |
| **Guard only** | **8.3 ± 0.2** | **91%** | **2–7** | **50 ± 1** | **82×** | 0.2% |
| Hybrid @ 0.5 | 8.9 ± 0.1 | 98% | 3–7 | 985 ± 263 | 4.2× | 24.1% |
| Hybrid + guard @ 0.9 | 9.0 ± 0.1 | 99% | 2–8 | 3,208 ± 49 | 1.3× | 78.1% |

Falls are given as the range over the 5 runs.

| | Measured (mean of 5 runs) | Outcome | Holds in |
| --- | --- | --- | --- |
| H1 | escalation 91.4% → 82.1% | not confirmed | 0/5 runs |
| H2 | guard only: 91.1% of the score at 82.3× lower cost | **confirmed** | 4/5 runs |
| H3 | 88.2% | **confirmed** | 5/5 runs |
| H4 | 94.2% agreement, ECE 0.022 | not confirmed (narrowly) | 1/5 runs |

The quadruped did **not** pass its feasibility spike (imitation agreement 60% against a threshold of 85%;
EXPERIMENTS.md, entries 27–29). The study was run after an exploratory follow-up, by the author's decision,
with H1–H4 unchanged (entries 30–31). As in racing, System One imitates the planner poorly (41% agreement)
but drives well: alone it walks 88% as far as the planner for 1/820 of the compute, and it falls less often
than the hand-written trot (12–23 against 67 falls in 200 episodes). The two-decision guard catches most of
its falls: with it, System One walks 91% as far as the planner, with as few falls (2–7 against 6), for 82×
less compute. The planner's horizon trades distance against safety: 0.5 s rollouts walk farther but fall
twice as often as 1 s rollouts, and 2 s rollouts fall least.

#### Uneven terrain (exploratory, dev seeds)

System One was trained on flat ground only, and it perceives nothing of the ground: its inputs are
proprioceptive. The planner simulates the real physics, so it "sees" any terrain through its rollouts. On
seeded hills (raised-cosine bumps up to 16°) and branches lying across the path (1 per metre, 2.4–5 cm
thick), the published network (run 1), unchanged, was evaluated on 40 dev seeds with the usual pushes
(`pnpm exp quadruped-terrain`). The difficulty was calibrated on the planner alone, by a rule fixed in
advance: the hardest level at which it falls on at most 20% of the seeds. At every level tried, it fell on
at most 5 of 40.

| Terrain | Planner | Hand-written trot | System One alone | Its mean confidence | Hybrid @ 0.9: escalated | Hybrid @ 0.9 |
| --- | --- | --- | --- | --- | --- | --- |
| Flat | 8.93 m, 2 falls | 5.77 m, 7 falls | 8.25 m (92%), 3 falls | 0.62 | 78% | 9.08 m, 2 falls |
| Branches | 8.87 m, 2 falls | 5.12 m, 13 falls | 7.83 m (88%), 5 falls | 0.60 | 81% | 9.05 m, 1 fall |
| Hills | 9.00 m, 3 falls | 3.64 m, 25 falls | 6.60 m (73%), 10 falls | 0.53 | 90% | 8.91 m, 2 falls |
| Hills and branches | 9.07 m, 3 falls | 3.65 m, 22 falls | 6.31 m (70%), 10 falls | 0.52 | 91% | 8.51 m, 5 falls |

- **Transfer is partial.** Alone, the network still walks much better than the hand-written trot it
  modulates, but on hills it covers only 70–73% of the planner's distance and falls about three times as
  often as on flat ground. Branches of this size barely affect it.
- **It knows, in part, that it does not know.** Its ensemble is less confident exactly where it transfers
  worst: mean confidence drops from 0.62 on flat ground to 0.52–0.53 on hills. With no change to the
  threshold, the hybrid therefore hands more decisions to the planner by itself (78% → 90–91% at 0.9, 46%
  → 68–69% at 0.7 with the guard) and keeps 94–99% of the planner's distance. This is the behaviour the
  System One / System Two split is meant to have, and the first time the lab tests it under a change of
  conditions.
- **The price is compute.** On hills the hybrid costs 2,800–3,700 units per move instead of 1,900–3,200 on
  flat ground. By the rule fixed before measuring (System One alone below 90% of the planner on a terrain
  where the planner is viable), a retraining on terrain is warranted.

Caveats: one network, 40 dev seeds, no test split; the confidence shift is descriptive, not a
pre-registered hypothesis.

### What the numbers say: five regimes

The same pipeline, network family, hybrid and guard produce different outcomes on the five environments.
Each is informative.

1. **Snake: the planner is needed, and the guard makes the hybrid safe.** System One alone is weak (9%),
   because a 7×7 window cannot see global traps. Confidence measures ambiguity, not stakes, and on dev seeds
   23 of 30 unguarded deaths were sealed by a confident move against the planner (`pnpm exp snake-deaths`).
   A shield-style check [13] closes most of that gap: from threshold 0.7, 98–99% of the planner's score at
   4–9× lower cost (`pnpm exp snake-guard-ablation`). Below 0.7, the result depends on the training run.
   Richer inputs add up to 7 points to System One alone and do not reliably help the unguarded hybrid
   (`pnpm exp snake-inputs`). Calibration is excellent (ECE 0.008).
2. **Lander: a hand-written rule is enough.** System One reaches 83% of the planner, but the autopilot
   that the planner uses as its base policy scores higher at the same cost. The autopilot is bang-bang: it
   alternates "none" and "main engine" on 60% of decisions, like PWM. Actions are therefore often
   equivalent, which caps agreement and confidence (`pnpm exp lander-imitation`, `lander-acceptability`).
3. **Racing and the quadruped: the student drives well without imitating well.** Regressing continuous
   controls [16, 21] removes the equivalence problem of discrete labels. The racing ensemble drives as far
   as the planner for ~1/1,000 of the cost while agreeing with it on only 51% of decisions; the quadruped's
   walks 88% as far with 41% agreement, and with the guard 91% for 82× less compute. Their confidence is
   poorly calibrated when they act alone (ECE 0.27 and 0.23), so "knowing when not to trust itself" works
   only partly, but these students rarely need the planner.
4. **Warehouse: confidence works, and escalation is where the value is.** System One alone is weak (40%):
   a local window cannot anticipate congestion, and its errors compound across the fleet. Its confidence is
   well calibrated (ECE 0.018), so escalation goes to the right decisions, and the hybrid beats the
   planner's own cost knob. It still falls short of the pre-registered 10× target (91% at 4.0×).

Across the five environments, **agreement with the teacher is a poor proxy for quality** whenever several
actions are equally good. The cheap guard is the most consistently useful component. The learned
confidence works as intended (H4) only where the planner's labels are unambiguous: Snake and the
warehouse, where one action is usually clearly best. The lander's planner breaks ties too, but many of its
actions are nearly equivalent, and continuous actions have no single right answer. **Results at the most
aggressive settings are fragile**: correcting a bug that changed 0.3% of Snake's training data was enough to
flip H2 for Snake, which had passed at threshold 0.5 in 4 of 5 runs. Five runs per game are a minimum, not
a luxury.

### Limitations

- **Development-time contamination, now re-validated.** Before the splits existed, a few design
  decisions were checked on seeds 1–30, today's test split (entries 4, 9 and 10 in
  [EXPERIMENTS.md](../EXPERIMENTS.md)). All of them were re-run on dev seeds with committed scripts. The
  decisions hold. One number did not: a death analysis first reported 28/30; on dev it is 23/30. The
  test split has since been used only for the final studies above.
- **The test split was used twice for Snake, the lander and the warehouse**: for the first studies and,
  after the dataset fix, for the corrected ones. No design decision was made between the two; only the bug
  was fixed, and both sets of results are published (EXPERIMENTS.md, decision 35).
- **Five runs give wide intervals** where the training variance is high (Snake at threshold 0.5 ± 74).
- **Design changes made during development** (planner tie-breaking, τ, lander physics and planner) are
  logged with their evidence in [EXPERIMENTS.md](../EXPERIMENTS.md) and the OpenSpec archive.
- **Strong or simple teachers.** Snake's planner nearly fills the board, and the lander's planner is
  built on a hand-written autopilot. The games are testbeds, not tasks that need a network.
- **Racing and the quadruped were integrated despite failing their pre-registered spikes** (entries 14–17
  and 27–31 in EXPERIMENTS.md). Their continuous System One uses a different model (a regression ensemble)
  and game-specific agreement definitions, both declared before measuring.
- **The warehouse is a grid abstraction**: unit-time moves, no kinematics, one layout and 16 robots. Its
  planner is windowed and prioritised, so it is fast but not optimal (unlike conflict-based search [29]).
- **The quadruped is a simulation**: one robot model, flat ground, pushes of a single size, and a planner
  that modulates a hand-written trot rather than controlling the joints directly.
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
34. Rizzo, S. (2026). Rizzo Flow. Post and demo on LinkedIn. https://www.linkedin.com/feed/update/urn:li:activity:7508412771974275072/
35. Runkle, S., & Lovell, H. (2026, September 17). Building a Harness with Jev. *LangChain Blog*. https://www.langchain.com/blog/building-a-harness-with-jev
36. Zhang, J., & Cho, K. (2017). Query-Efficient Imitation Learning for End-to-End Simulated Driving. *AAAI 2017*.
37. Raibert, M. H. (1986). *Legged Robots That Balance*. MIT Press.
38. Ijspeert, A. J. (2008). Central pattern generators for locomotion control in animals and robots: A review. *Neural Networks*, 21(4), 642–653.
39. Iscen, A., Caluwaerts, K., Tan, J., Zhang, T., Coumans, E., Sindhwani, V., & Vanhoucke, V. (2018). Policies Modulating Trajectory Generators. *CoRL 2018*.
40. Di Carlo, J., Wensing, P. M., Katz, B., Bledt, G., & Kim, S. (2018). Dynamic Locomotion in the MIT Cheetah 3 Through Convex Model-Predictive Control. *IROS 2018*.
41. Tassa, Y., Erez, T., & Todorov, E. (2012). Synthesis and Stabilization of Complex Behaviors through Online Trajectory Optimization. *IROS 2012*.
42. Howell, T., Gileadi, N., Tunyasuvunakool, S., Zakka, K., Erez, T., & Tassa, Y. (2022). Predictive Sampling: Real-time Behaviour Synthesis with MuJoCo. arXiv:2212.00541.
43. Carius, J., Farshidian, F., & Hutter, M. (2020). MPC-Net: A First Principles Guided Policy Search. *IEEE Robotics and Automation Letters*, 5(2), 2897–2904.
44. Lee, J., Hwangbo, J., Wellhausen, L., Koltun, V., & Hutter, M. (2020). Learning Quadrupedal Locomotion over Challenging Terrain. *Science Robotics*, 5(47), eabc5986.
45. Hwangbo, J., Lee, J., Dosovitskiy, A., Bellicoso, D., Tsounis, V., Koltun, V., & Hutter, M. (2019). Learning Agile and Dynamic Motor Skills for Legged Robots. *Science Robotics*, 4(26), eaau5872.
46. Dimforge. Rapier physics engine, deterministic WebAssembly build `@dimforge/rapier3d-deterministic-compat` 0.20.0. https://rapier.rs
