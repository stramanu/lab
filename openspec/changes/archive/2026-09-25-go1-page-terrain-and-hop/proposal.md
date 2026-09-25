# Proposal

## Why

On the Go1 page, a robot that fell sank through the ground: the model used for training collides with the
ground only by its feet. Visitors also asked for obstacles and a jump.

## What Changes

- **Full-collision robot on every scene of the page.** The policy was trained on the feet-only model, which
  behaves the same while walking. A fallen robot now lies on the ground: its trunk stays at about 0.06 m
  instead of −0.25 m.
- **Falls:** a fall is detected as a flip or as a collapse (trunk within 12 cm of the lowest foot), and the
  robot restarts. On rough ground it also restarts at the edge of the 20 × 20 m heightfield.
- **An obstacle course of our own**, generated with exact geometry by `export_web_assets.py`:
  - ramps of 5.7°, steps of 2, 4 and 6 cm, bumps of 2–4 cm;
  - then steps of 8, 10 and 12 cm.
  - In a check on 5 episodes, the first part was cleared every time and the 8 cm step 2 times in 5.
- **Hop (space bar or button):** it adds 2 m/s of upward velocity to the whole robot. It is not a learned
  jump, and the page says so.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- **Page and scenes:** `web/applied/go1/`, `applied/mujoco-quadruped/export_web_assets.py`, the page scenes
  in `web/public/applied/assets/go1/`.
- **Results:** no experiment result changes.
