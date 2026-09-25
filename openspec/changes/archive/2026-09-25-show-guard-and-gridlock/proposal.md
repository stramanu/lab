# Proposal

## Why

Visitor feedback on the System One page raised two points:
- **The guard seems to never act.** It does act, but rarely: it stops 0.1–1% of moves, and those are the
  decisive ones. In "Who decided" that share is almost invisible.
- **The warehouse fleet freezes as an episode goes on**, whoever drives. The planner has no deadlock
  resolution. This was measured but not reported.

## What Changes

- **Guard, made visible.** Every move the guard stops makes the board and the guard's row glow briefly in
  its color (shortened under reduced motion), and the row counts the moves it stopped in the current run.
- **Gridlock, measured and reported.** A new experiment, `pnpm exp warehouse-gridlock` on dev seeds,
  measures deliveries in the first and last quarter of an episode and the episodes that end frozen. The
  result goes into the write-up's limitations, with PIBT [47] as the reference, into the log (decision 38)
  and into the warehouse's explainer on the page.

## Capabilities

### New Capabilities

### Modified Capabilities
- `demo-ui`: guard interventions are shown.

## Impact

- **Code and site:** `web/main.ts`, styles, the System One page, `web/explainers.ts`.
- **Experiments and docs:** a new experiment; docs and the log.
- **Results:** no published result changes.
