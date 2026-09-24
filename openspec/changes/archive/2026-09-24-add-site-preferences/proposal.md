# Proposal

## Why

Two requests from the author: the light/dark choice is forgotten on every page load and differs between pages, and on the quadruped the visitor cannot turn off the seeded random pushes to watch the gait (or their own pushes) alone.

## What Changes

- **Theme persistence.** The light/dark choice is saved in the browser's local storage and shared by every page of the lab. An inline script in each page's `<head>` applies it before the first paint, so the page never flashes the other theme. Without storage (private browsing, blocked), the site falls back to the system theme.
- **Quadruped random pushes switch.** It is on by default, as in the experiment, and takes effect at once. Off: the remaining seeded pushes of the episode are dropped, and later episodes have none. On: the pushes still due from now on are restored. Visitor pushes by dragging are unaffected. It is a demo control only and changes no experiment.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `lab-site`: theme persistence across pages.
- `demo-ui`: the quadruped's random-pushes switch.

## Impact

- `web/theme.ts` (new), the three pages' `<head>` and scripts, `web/quadruped-controls.ts` (new), `web/systemone/index.html`, `web/main.ts`.
