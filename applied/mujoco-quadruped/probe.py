"""Local probe for the applied quadruped spike: loads the Go1 rough-terrain environment of MuJoCo
Playground, prints its dimensions and measures the speed of one environment on this machine."""
import time

import jax
import jax.numpy as jp
from mujoco_playground import registry

ENV = "Go1JoystickRoughTerrain"


def main() -> None:
    t = time.time()
    env = registry.load(ENV)
    print(f"loaded {ENV} in {time.time() - t:.1f} s")
    print(f"observations {env.observation_size}, actions {env.action_size}, control dt {env.dt} s, simulation dt {env.sim_dt} s")
    print(f"model: {env.mj_model.nbody} bodies, {env.mj_model.njnt} joints, {env.mj_model.nu} actuators, {env.mj_model.ngeom} geoms")
    print(f"devices: {jax.devices()}")
    reset, step = jax.jit(env.reset), jax.jit(env.step)
    state = reset(jax.random.PRNGKey(0))
    state = step(state, jp.zeros(env.action_size))
    jax.block_until_ready(state.obs)
    n = 200
    t = time.time()
    for _ in range(n):
        state = step(state, jp.zeros(env.action_size))
    jax.block_until_ready(state.obs)
    dt = (time.time() - t) / n
    print(f"one environment: {1000 * dt:.2f} ms per control step = {env.dt / dt:.2f}x real time")


if __name__ == "__main__":
    main()
