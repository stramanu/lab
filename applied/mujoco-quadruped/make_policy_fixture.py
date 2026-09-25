"""Writes a small test fixture for the TypeScript policy (A3): a random brax PPO policy with Playground's
structure (normalized 'state' observation, swish MLP, normal-tanh action distribution) but tiny layers,
with JAX's deterministic actions on random observations.

Usage: .venv/bin/python make_policy_fixture.py [--out ../../test/fixtures/brax-policy-small.json]
"""
import argparse
import json
from pathlib import Path

import jax
import jax.numpy as jp
import numpy as np
from brax.training.acme import running_statistics
from brax.training.agents.ppo import networks as ppo_networks
from flax import serialization

OBS = {"state": (48,), "privileged_state": (123,)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).parent / ".." / ".." / "test" / "fixtures" / "brax-policy-small.json"))
    out = Path(parser.parse_args().out).resolve()
    net = ppo_networks.make_ppo_networks(
        observation_size=OBS,
        action_size=12,
        preprocess_observations_fn=running_statistics.normalize,
        policy_hidden_layer_sizes=(16, 16, 16),
        value_hidden_layer_sizes=(8,),
        policy_obs_key="state",
        value_obs_key="privileged_state",
    )
    key = jax.random.PRNGKey(7)
    k1, k2, k3, k4 = jax.random.split(key, 4)
    policy_params = net.policy_network.init(k1)
    specs = {k: jax.ShapeDtypeStruct(v, jp.float32) for k, v in OBS.items()}
    normalizer = running_statistics.init_state(specs)
    normalizer = normalizer.replace(
        mean={k: jax.random.normal(k2, v) * 0.3 for k, v in OBS.items()},
        std={k: 0.5 + jax.random.uniform(k3, v) for k, v in OBS.items()},
    )
    infer = jax.jit(ppo_networks.make_inference_fn(net)((normalizer, policy_params), deterministic=True))
    rng = np.random.default_rng(3)
    pairs = []
    for _ in range(20):
        obs = {k: jp.asarray(rng.normal(size=v).astype(np.float32)) for k, v in OBS.items()}
        action, _ = infer(obs, jax.random.PRNGKey(0))
        pairs.append({"state": np.asarray(obs["state"]).tolist(), "action": np.asarray(action).tolist()})
    to_lists = lambda t: jax.tree_util.tree_map(lambda x: np.asarray(x).tolist(), serialization.to_state_dict(t))
    fixture = {"normalizer": to_lists(normalizer), "policy": to_lists(policy_params), "network": {"hidden": [16, 16, 16], "activation": "swish"}, "pairs": pairs}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture))
    print(f"→ {out} ({out.stat().st_size / 1e3:.0f} kB), {len(pairs)} pairs")


if __name__ == "__main__":
    main()
