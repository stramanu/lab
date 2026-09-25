# Proposal

## Why

The quadruped's animation stuttered. The network decides in microseconds, but the planner takes 0.2–0.4 s
per decision on one browser thread. Each decision covers 0.1 s of simulated time, so the robot moved in
slow motion. Worse, the view knew only the poses at the start and end of each decision, and a trot at 3 Hz
covers a third of a stride in that time, so the legs cut straight lines instead of stepping.

## What Changes

- **Smooth motion.** The live environment reports every physics step (`onPhysicsStep`, not copied to the
  planner's or guard's copies). The view records a pose every 4 steps (20 ms) and plays the real motion
  back between decisions.
- **Faster planner in the browser.** The planner is split into per-candidate values
  (`QuadrupedTeacher.candidateValue`) and their combination (`combine`, `choose`). The page spreads the 21
  candidates over up to 4 workers and combines the results. The answer is identical to the planner's in
  place: a test compares them bitwise.
- **Measured on hills**, where the planner decides 90% of the moves: the robot now advances 1.4 simulated
  seconds per real second, against about 0.26 before.
- **Comment fix.** The planner's comment no longer claims a guarantee over the base controller beyond a
  single rollout.

## Capabilities

### New Capabilities

### Modified Capabilities
- `demo-ui`: the quadruped view plays the recorded motion; the planner runs across several workers.

## Impact

- **Code:** `src/games/quadruped/planning.ts` and `env.ts`, `web/quadruped-view.ts`,
  `web/planner-worker-client.ts`, `web/quadruped-planner-worker.ts`, one test.
- **Results:** no experiment result changes, and the planner's answers are identical.
