# Applied quadruped: Unitree Go1 in MuJoCo

This is the lab's first experiment on its **applied** side: established libraries (MuJoCo Playground, JAX,
MuJoCo Warp), GPUs (Google Colab) and a model of a real robot, under the same method as the rest of the
lab. The rationale is in [docs/proposals/mujoco-quadruped.md](../../docs/proposals/mujoco-quadruped.md);
the feasibility spike's criteria are in `openspec/changes/add-applied-mujoco-spike/design.md`.

## Local setup (CPU: probes only; training needs an NVIDIA GPU)

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python probe.py
```

Measured on an Apple M4 Max (2026-09-25): `Go1JoystickRoughTerrain` loads in 0.3 s and steps one
environment at 0.2× real time on the CPU (MuJoCo Warp backend). Observations: a 48-value state and a
123-value privileged state; 12 actuators; control at 50 Hz.

## Training on Colab (spike A2)

Open [`train_go1_a2.ipynb`](train_go1_a2.ipynb) in Colab with a GPU runtime and run all cells. It trains
Playground's default PPO configuration, evaluates the policy against criterion A2, and downloads
`go1-a2-results.zip` (the policy for A3 and the results). The notebook was smoke-tested locally on the CPU
with a tiny budget. That test found that `pip install playground` resolves JAX 0.11, which breaks
training with brax 0.14.2, so JAX is pinned to 0.9.2.

## Third-party model

The Unitree Go1 model comes from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie)
(`unitree_go1`), under the BSD 3-Clause License, © 2016–2022 HangZhou YuShu Technology Co., Ltd.
("Unitree Robotics"). Any copy of the model distributed with this project keeps that notice.
