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

## Third-party model

The Unitree Go1 model comes from [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie)
(`unitree_go1`), under the BSD 3-Clause License, © 2016–2022 HangZhou YuShu Technology Co., Ltd.
("Unitree Robotics"). Any copy of the model distributed with this project keeps that notice.
