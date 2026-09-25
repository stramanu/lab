# Lab

Small, reproducible experiments in machine learning, planning and control, by Emanuele Strazzullo.
The lab has two sides:
- **From scratch** (experiments 01–02): the networks, their training, the planners and the simulations are
  written in TypeScript with no ML libraries. The one exception is the quadruped's 3D physics, which uses
  the Rapier engine. Everything runs in Node or in a browser tab.
- **Applied** (experiment 03): established tools (MuJoCo, MuJoCo Playground, JAX, a Colab GPU) and models
  of real robots. The page says so, and the method is the same. Every result comes with the protocol that produced it, and negative results
are published like positive ones.

**Live:** <https://lab.emanuelestrazzullo.dev> · [![CI](https://github.com/stramanu/lab/actions/workflows/ci.yml/badge.svg)](https://github.com/stramanu/lab/actions/workflows/ci.yml)

## Experiments

| | Question | Write-up | Page |
| --- | --- | --- | --- |
| 01 | **System One / System Two.** Can a tiny network, trained by a slow planner, make most decisions at a fraction of the planner's cost, and know when to hand control back? Five environments: Snake, lander, warehouse, racing, quadruped. | [docs/systemone.md](docs/systemone.md) | [/systemone/](https://lab.emanuelestrazzullo.dev/systemone/) |
| 02 | **Handwriting pad.** Can a 22k-parameter network read handwritten letters as well as a classic recogniser that compares each letter with every stored example? | [docs/handwriting.md](docs/handwriting.md) | [/handwriting/](https://lab.emanuelestrazzullo.dev/handwriting/) |
| 03 | **Go1 in your browser** (applied side). Can a model of a real robot, trained on a GPU with MuJoCo Playground, walk in a browser tab, and can a planner teach it where it struggles? Feasibility spike done; study next. | [docs/proposals/mujoco-quadruped.md](docs/proposals/mujoco-quadruped.md) | [/applied/go1/](https://lab.emanuelestrazzullo.dev/applied/go1/) |

Headline results (test data, mean of 5 training runs). The Snake, lander and warehouse studies were re-run
after a bug fix in the training data; the corrected numbers are below, and the change is documented in the
write-up.

- **Snake**: with a cheap safety check, the hybrid reaches 98% of the planner's score for 8.8× less compute,
  just short of the 10× target; more aggressive settings are cheaper but depend on the training run.
- **Lander**: a hand-written autopilot beats the network at the same cost.
- **Warehouse**: with less compute than the planner's cheaper setting (95 vs 115 units per move), the hybrid
  delivers 89.4 loads against 60.1; the pre-registered 10× target is missed.
- **Racing**: the network alone drives 99.9% as far as the planner for 1,164× less compute.
- **Quadruped**: the network with its safety check walks 91% as far as the planner for 82× less compute,
  although it agrees with the planner on only 41% of decisions.
- **Go1 (applied)**: trained in 84 minutes on a free Colab T4, the policy walks on rough ground with no falls
  and runs in the browser exactly as in training; a first GPU planner did not improve on it.
- **Handwriting**: 83.9% of letters right on 20 unseen writers, against 83.2% for the classic recogniser,
  for 1,302× less arithmetic; the 90% target is missed.

Planned next, with their rationale and references: [docs/proposals/](docs/proposals/README.md) (a quadruped
that sees the ground, then a rocket booster landing under a safety monitor).

## How experiments are run

- **Targets first.** What would count as success is written down before measuring, and never changed.
- **Separate data.** Design decisions use development seeds (or writers); final numbers use held-out
  test ones, which the code refuses to use unless asked explicitly.
- **Repeated runs.** Final results are the mean of 5 independent training runs with Student-t 95% intervals.
- **Feasibility first.** Before a long study, a short spike with go/no-go criteria decides whether it
  is worth running; a failed spike is reported, and any later revision is declared before re-measuring.
- **Everything logged.** [EXPERIMENTS.md](EXPERIMENTS.md) records every design decision with its evidence,
  the data it was measured on, and whether it touched the test split.
- **Deterministic.** Everything is seeded; the same configuration produces byte-identical weights, and
  parallel evaluation gives the same numbers as sequential (both are tested).

Specifications and the history of every change, with design notes, are tracked with
[OpenSpec](https://github.com/Fission-AI/OpenSpec) in `openspec/`.

## Reproduce

Requires Node ≥ 22 and pnpm.

```sh
pnpm install
pnpm typecheck && pnpm test     # gradient checking, determinism, reproducibility, parallel = sequential, …
```

The commands for each experiment's studies and supporting experiments are in its write-up.

## The site

```sh
pnpm dev            # local dev server
pnpm build          # static site in dist/ (works from any path)
pnpm preview        # serve dist/
pnpm demo:data      # publish each study's run-1 weights and results (and the $P templates) to web/public/data/
pnpm site:deploy    # build site/ and deploy it (Cloudflare Worker with static assets; `pnpm exec wrangler login` once)
```

| Path | Page |
| --- | --- |
| `/` | the lab |
| `/systemone/` | System One / System Two |
| `/handwriting/` | Handwriting pad (the former `/systemone/handwriting/` redirects here) |
| `/applied/go1/` | Go1 in your browser (applied side) |
| `/data/` | published weights and study results |

## Layout

```
src/core/         Env / Teacher / Student / Guard / Player contracts, seeded PRNG, statistics
src/games/        registry.ts; snake/, lander/, warehouse/, racing/, quadruped/ (environments, planners, guards)
src/nn/           MLP, backprop (cross-entropy and MSE), Adam, soft labels, temperature scaling, ECE, deep ensemble
src/hybrid/       confidence measures and System One / System Two / hybrid players
src/training/     bootstrap → DAgger-style escalation loop → consolidation, for discrete and continuous games
src/eval/         seed splits, conditions, runner, hypothesis checks, multi-run aggregation
src/handwriting/  UJI parsing and writer split, preprocessing, encodings, MLP recogniser, $P
data/             derived handwriting dataset (uppercase UJI Pen Characters v2) and its licence notice
scripts/          Node CLIs (train, eval, study with a worker pool, data, benchmarks, site build)
experiments/      one reproducible script per supporting claim (dev data only)
web/              the site: lab home, /systemone/ (game views, 3D views, charts, workers), /handwriting/
docs/             one write-up per experiment, with results and references; proposals/ for planned ones
openspec/         specifications and the archived history of every change
```

## License

The code is released under the [MIT License](LICENSE). The derived handwriting dataset in `data/` keeps
its source's licence, CC BY 4.0 (see [data/NOTICE.md](data/NOTICE.md)).

