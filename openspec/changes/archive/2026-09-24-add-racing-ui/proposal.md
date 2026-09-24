# Proposal

## Why

The racing result is the most visual of the four games: the student matches its planner at about 1/1,000 of the cost. The page should show that comparison directly: the student and the planner driving side by side, how the student drives (speed, steering, pedal), and where it hands control back. The user asked for four additions.

## What Changes

- **Planner ghost.** A semi-transparent second car on the same track and seed, driven by the planner alone and advanced in lockstep with the live car. The page shows the gap in metres between them.
- **Live telemetry.** Speed, steering and pedal over the last 20 s, with the moves escalated to the planner marked.
- **Speed-coloured trajectory.** The trail can be coloured by speed instead of by decider, with braking points marked.
- **Lap timing and full-track view.** Current, last and best lap times, and a toggle between the chase camera and a view of the whole track.

All four are racing-only controls, shown when the racing game is selected.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `demo-ui`: racing-specific visual controls (ghost, telemetry, trail mode, laps and camera).

## Impact

- `web/racing-view.ts` (ghost, trail modes, laps, camera), new `web/telemetry.ts`, `web/main.ts` (ghost stepping, telemetry buffer, controls), `web/index.html`, `web/styles.css`.
- Display only: the ghost's planner compute is not counted in the live cost readout.
