# Proposal: a real quadruped (Unitree Go1) in MuJoCo, with GPU physics

Status: **started**. This is the first experiment of the lab's "applied" side: established libraries, GPUs
and a model of a real robot, under the same method as the rest of the lab. The feasibility spike's
criteria are fixed in the OpenSpec change `add-applied-mujoco-spike` before any measurement.

## Why

The from-scratch quadruped taught three things, all limited by its simulator:

1. **The planner is the bottleneck.** Every System Two decision simulates 21 futures in Rapier on one CPU
   core (0.2–0.4 s). Studies take 6–12 hours, and planner quality is capped by what fits in that budget.
2. **The robot is a toy.** The network modulates a hand-written trot instead of driving the joints.
3. **Blind networks cannot learn terrain from escalations** (EXPERIMENTS.md, decisions 37 and 39).
   Perception is the next question, and it deserves a realistic robot.

**GPU physics removes the first limit.** MuJoCo's GPU backends (MJX on JAX, and MuJoCo Warp) simulate
thousands of robots in parallel. MuJoCo Playground (Zakka et al. 2025) trains the Unitree Go1 to walk on
rough terrain in minutes on one GPU, and those policies transfer to the real robot.

On a GPU, the planner can evaluate hundreds or thousands of futures per decision, the sampling MPC of the
literature (MPPI, Williams et al. 2016; predictive sampling, Howell et al. 2022). Data collection and
evaluation over many episodes run at once.

**The browser stays.** DeepMind's official WebAssembly build (`@mujoco/mujoco`, Apache-2.0, v3.14.0, the
same MuJoCo version as the training stack) runs the same robot model in a page. The trained policy is a
small MLP that our TypeScript code can evaluate.

## What exists already (checked on 2026-09-25, locally)

- `pip install playground` installs MuJoCo 3.14.0, JAX 0.11 and the environments
  `Go1JoystickFlatTerrain`, `Go1JoystickRoughTerrain`, `Go1Getup`, `Go1Handstand` and `Go1Footstand`.
- `Go1JoystickRoughTerrain`:
  - 12 actuators, control at 50 Hz (0.02 s), simulation at 250 Hz;
  - a 48-value observation (what a real robot measures) and a 123-value privileged observation (what a
    teacher or critic may use): the teacher–student split of this lab, out of the box;
  - backend: MuJoCo Warp.
- **On the reference Mac (CPU only)** one environment steps at 0.2× real time (98 ms per 20 ms step).
  Training and planning must run on an NVIDIA GPU (Colab).
- **Robot model:** `unitree_go1` from MuJoCo Menagerie, BSD 3-Clause License, © Unitree Robotics. The
  licence notice must ship with any copy of the model.

## Questions (for the experiment after the spike)

1. **System One / System Two on a real robot model.** The planner is a GPU sampling MPC over the true
   physics, and the network a policy distilled from it with escalation. Does the hybrid reach the
   planner's quality at a fraction of its cost, and does the network know when to hand over, on terrain
   it has not seen?
2. **Imitation against reinforcement learning at equal compute.** Playground's PPO policy against a policy
   distilled from the planner, measured in simulated steps.
3. **Perception, modular.** A height-scan encoder, a proprioceptive encoder and a motor network, taught by
   a privileged teacher. This is the from-scratch spike's question on a real robot.

## Feasibility spike (criteria in `add-applied-mujoco-spike`)

- **A1, browser.** The Go1 scene runs in a page with `@mujoco/mujoco` at least at real time on the
  reference machine, policy inference included.
- **A2, training.** Playground's PPO on `Go1JoystickRoughTerrain` trains on a Colab GPU within a fixed
  time budget and walks. The policy is exported.
- **A3, transfer.** The exported policy, evaluated in TypeScript, reproduces JAX's actions, and it walks
  in the browser's CPU MuJoCo (sim-to-sim transfer).
- **A4, GPU planner.** A batched sampling planner over MJX/Warp rollouts evaluates at least a fixed
  number of futures per decision within a fixed time on a Colab GPU.

## Where things live

- `applied/mujoco-quadruped/`: Python (training, planner, notebooks for Colab), with a virtual environment
  that is not committed.
- The page, when it exists: `web/applied/` (planned), running the same model with `@mujoco/mujoco`.
- Results: `artifacts/applied/` for summaries; weights are published as small JSON files, as today.

## References

- Zakka, K., et al. (2025). MuJoCo Playground. arXiv:2502.08844.
- Todorov, E., Erez, T., & Tassa, Y. (2012). MuJoCo: A Physics Engine for Model-Based Control. *IROS 2012*.
- Menagerie: Zakka, K., Tassa, Y., & MuJoCo Menagerie Contributors (2022). MuJoCo Menagerie: A collection of high-quality simulation models for MuJoCo. https://github.com/google-deepmind/mujoco_menagerie
- Williams, G., Drews, P., Goldfain, B., Rehg, J. M., & Theodorou, E. A. (2016). Aggressive Driving with Model Predictive Path Integral Control. *ICRA 2016*.
- Howell, T., Gileadi, N., Tunyasuvunakool, S., Zakka, K., Erez, T., & Tassa, Y. (2022). Predictive Sampling: Real-time Behaviour Synthesis with MuJoCo. arXiv:2212.00541.
- Schulman, J., Wolski, F., Dhariwal, P., Radford, A., & Klimov, O. (2017). Proximal Policy Optimization Algorithms. arXiv:1707.06347.
- Rudin, N., Hoeller, D., Reist, P., & Hutter, M. (2022). Learning to Walk in Minutes Using Massively Parallel Deep Reinforcement Learning. *CoRL 2021*, PMLR 164.
