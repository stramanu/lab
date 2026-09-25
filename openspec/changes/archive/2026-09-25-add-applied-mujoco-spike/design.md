# Design

## Context

Checked locally on 2026-09-25:
- `playground` installs MuJoCo 3.14.0 and JAX 0.11.
- **The environment:** `Go1JoystickRoughTerrain` has 12 actuators, control at 50 Hz and simulation at
  250 Hz. Its observations are a 48-value state and a 123-value privileged state. Backend: MuJoCo Warp.
- **On the reference Mac (M4 Max, CPU only)** one environment steps at 0.2× real time, so training and
  planning need an NVIDIA GPU (Colab).
- **The browser build:** `@mujoco/mujoco` 3.14.0 on npm, Apache-2.0.

## Spike criteria (fixed before any measurement)

- **A1, browser.**
  - *Setup:* the Go1 scene from Menagerie, flat and rough, loaded with `@mujoco/mujoco`'s single-threaded
    build in Chrome on the reference machine.
  - *Pass if:* it steps at least at 1.0× real time over 20 simulated seconds, including the inference of
    a 3-layer MLP policy at 50 Hz in TypeScript.
- **A2, training.**
  - *Setup:* Playground's default PPO configuration for `Go1JoystickRoughTerrain`, on a Colab GPU. The GPU
    model is recorded.
  - *Pass if:* training ends within 60 minutes of wall-clock time, and the policy walks. Evaluated in
    MJX/Warp on 10 episodes of 20 s with a forward command of 0.5 m/s: at most 1 fall, and a mean forward
    speed of at least 0.35 m/s.
- **A3, transfer.**
  - *Setup:* the policy exported as JSON and evaluated in TypeScript.
  - *Pass if:*
    - its actions match JAX's within 1e-4, maximum absolute difference, on 100 recorded observations;
    - in the browser's MuJoCo (C engine, WebAssembly), on 10 episodes of 20 s with a forward command of
      0.5 m/s on flat ground, at most 1 fall and a mean forward speed of at least 0.35 m/s.
- **A4, GPU planner.**
  - *Setup:* a batched sampling planner (predictive sampling: perturb a nominal action sequence, roll out
    in parallel, keep the best) over MJX/Warp rollouts, on the Colab GPU.
  - *Pass if:* it evaluates at least 512 rollouts with a 0.5 s horizon per decision within 100 ms, and
    over 10 episodes of 20 s it walks at least as far as the base policy (Playground's PPO) on rough
    terrain.

## What follows

- **If A1–A4 pass:** a study is designed as its own change, with the questions of the proposal and
  targets fixed in advance.
- **If A1 or A3 fail:** the page shows recorded rollouts instead of live physics, and this is stated.
- **If A2 or A4 fail:** the result is reported, and the next step is declared before re-measuring.

## Risks

- **Colab's GPU model and session limits vary.** The GPU and the times are recorded, and the budgets hold
  for the GPU actually used.
- **Warp against MJX backends:** results may differ slightly between them. The backend is recorded.

## Clarifications before any measurement (2026-09-25)

- **A2's walking test measures progress along the robot's initial heading.** Playground's reset draws a
  random heading, and the command is in the body frame.
- **A4 runs on MJX's JAX backend (`impl='jax'`).** The Warp backend's state cannot be replicated into a
  batch of copies. The "policy alone" reference for A4 is therefore re-measured on the same backend and
  the same 10 episodes (seeds, command, terrain), so the comparison is paired on one engine. The planner
  decides at every control step (50 Hz): N = 512 copies, horizon H = 25 steps (0.5 s), Gaussian action
  noise σ = 0.3 around the policy's actions, copy 0 without noise, score = the task reward summed while
  standing.
- **JAX is pinned to 0.9.2.** brax 0.14.2, the latest, fails with JAX 0.10 and later; the local smoke
  test found it.
