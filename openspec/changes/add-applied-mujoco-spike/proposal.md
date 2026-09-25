# Proposal

## Why

The from-scratch quadruped is limited by its simulator:
- its planner simulates 21 futures on one CPU core per decision, so studies take 6–12 hours;
- the network modulates a hand-written trot instead of driving the joints.

GPU physics (MuJoCo's MJX and Warp backends) and a model of a real robot (the Unitree Go1 from MuJoCo
Menagerie) lift both limits. MuJoCo Playground trains the Go1 on rough terrain in minutes on one GPU, and
DeepMind's WebAssembly build runs the same model in a browser. The rationale is written in
`docs/proposals/mujoco-quadruped.md`.

This opens the lab's second side, **applied**, under stated rules:
- established libraries and GPUs are allowed, and every page says so;
- the method stays the same: targets fixed first, held-out evaluation, repeated runs, negative results
  published.

## What Changes

- **A new capability, `applied-experiments`:** the rules of the applied side.
- **`applied/mujoco-quadruped/`:**
  - a Python project (Playground, MJX/Warp), with a virtual environment that is not committed;
  - a Colab notebook for training and the GPU planner.
- **A feasibility spike (A1–A4)** with criteria fixed in design.md. It checks the browser, training on
  Colab, transfer to the browser and a GPU planner before any study is designed.

## Capabilities

### New Capabilities
- `applied-experiments`: rules of the applied side of the lab.

### Modified Capabilities

## Impact

- **New code:** Python under `applied/`, and later a page under `web/applied/` with `@mujoco/mujoco`
  (Apache-2.0).
- **Third-party model:** the Go1 model (BSD 3-Clause, © Unitree Robotics); its licence notice ships with
  any copy.
- **Results:** no from-scratch result changes.
