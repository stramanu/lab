# Proposals and ideas

Experiments under consideration, written down so they do not depend on anyone's memory. A proposal
becomes an experiment only through an OpenSpec change, which fixes its targets and go/no-go criteria
before any measurement.

## Next, in order

1. [A quadruped that sees the ground](quadruped-vision.md): a height-scan sensor for the quadruped's
   System One, taught by the planner as a privileged teacher. It follows the terrain spike (decision 37)
   and the terrain retraining study.
2. [Landing a rocket booster under a safety monitor](rocket-landing.md): the System One / guard /
   System Two split as aerospace runtime assurance (Simplex).

## Ideas, not yet proposals

- **A biped (humanoid) in MuJoCo.** Reinforcement learning on a GPU (Colab) with MuJoCo Playground
  (Zakka et al. 2025), run in the browser through MuJoCo's WebAssembly build. The lab question is a fast
  System One with a sampling planner (Howell et al. 2022) that steps in when the network is unsure. The
  risk is a planner fast enough to save a falling biped.
- **Imitation against reinforcement learning at equal compute (quadruped).** Is it cheaper to adapt to a
  new terrain by asking the planner (expensive labels) or by trial and error (cheap, many samples: PPO,
  Schulman et al. 2017, started from the imitation network as in Rajeswaran et al. 2018)? Measured in
  physics steps.
- **Warehouse v2 with deadlock resolution.** A planner with priority inheritance and backtracking (PIBT,
  Okumura et al. 2022) or rolling-horizon conflict resolution (Li et al. 2021). It answers the gridlock
  limitation of decision 38 as a new version of the experiment.
- **A System One for LLM agents (the lab's "applied" side).**
  - Benchmark the calibration and cost of small open language models used as typed-decision System Ones
    (the Rizzo Flow technique), against a large model as System Two.
  - Then distil a tiny model with escalation, on routing (RouteLLM, Ong et al. 2024; RouterBench, Hu et
    al. 2024) or tool-call guardrails.
- **A Go1 that learns to jump.** The page's jump is a hand-written leg sequence: it cannot correct its
  rotation in the air and sometimes falls, more often on rough ground. A learned jump needs a Playground
  environment with a jump reward (take-off height and a stable landing), trained on Colab like the
  walking one.
- **Drone racing.** Quadrotor dynamics, a sampling MPC (MPPI) as System Two, and the network distilled
  from it. Reference: Kaufmann et al. (2023), Champion-level drone racing using deep reinforcement
  learning, *Nature* 620, 982–987.

## Two sides of the lab

- **From scratch:** everything written here, CPU only, runs in the browser. This is what exists today.
- **Applied (planned):** established libraries, GPUs (for example Colab) and models of real robots,
  under the same method (targets first, held-out test data, repeated runs, negative results published),
  with the difference stated on every page.
