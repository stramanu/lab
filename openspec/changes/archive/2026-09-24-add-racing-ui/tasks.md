# Tasks

- [x] 1 Extend `web/racing-view.ts`: planner ghost (drawn semi-transparent with its own thin trail), trail modes (decider / speed with braking marks), lap timing (current, last, best), camera modes (chase / full track); add the pure lap-time helper with a unit test
- [x] 2 Add `web/telemetry.ts` (speed, steering, pedal over the last 200 decisions, escalation marks) and the racing-only controls row (camera, trail, ghost) with the gap and lap readouts in `index.html`, `styles.css`, `main.ts`; the ghost steps in lockstep and resets with the live car
- [x] 3 Verify in the browser (Playwright): the ghost and the gap appear, telemetry marks escalations, both trail modes and both cameras render, lap times update, other games hide the racing controls, no console errors, desktop and 375px; run typecheck, tests, build and strict validation; redeploy
