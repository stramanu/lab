# Proposal

## Why

The page's hop threw the whole robot upward, and the author did not like a fake jump: the robot should
jump with its own legs.

## What Changes

- **A hand-written jump with the robot's own legs** (`web/applied/go1/jump.ts`). The walking policy brakes
  for 300 ms, then the motors follow a fixed sequence (crouch, push, legs back in the air), and the policy
  takes over to land.
- **Tuned in simulation**, 12 episodes per setting:
  - about 10–11 cm of trunk rise;
  - 12/12 landings standing still;
  - on rough ground, with the brake, 12/12 at 0.5 m/s and 11/12 at 0.8 m/s.
  - In the browser: 5/5 jumps landed while walking.
- **Higher sequences (15–50 cm) pitched up to about 90° in the air and fell.** The page says so: agile jumps
  are learned.
- **The fake hop is removed.**

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- **Code:** `web/applied/go1/`.
- **Results:** no experiment result changes. A learned jump is listed in `docs/proposals/README.md`.
