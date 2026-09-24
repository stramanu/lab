# Design

## Decisions

### URLs and build
- Vite pages: `web/index.html` (lab home), `web/systemone/index.html` (games), `web/handwriting/index.html` (handwriting pad).
- `web/public/data` is served at `/data/`. Pages fetch `../data/…` relative to their own folder, so the build works under any path.
- `scripts/build-site.ts` builds straight into `site/`. `_redirects`:
  - `/systemone` → `/systemone/`;
  - `/handwriting` → `/handwriting/`;
  - `/systemone/handwriting/*` → `/handwriting/:splat` (301).

  The old root redirect to `/systemone/` is removed. `_headers` caches `/assets/*` immutably and `/data/*` for 5 minutes.

### Navigation
A thin bar on top of every page:
- the lab's name, linking home;
- the experiments: "System One", "Handwriting";
- the theme toggle.

The current page is marked with `aria-current`. It replaces the ad-hoc cross-links.

### Lab home
The same editorial style as the other pages. Sections:
- a masthead (the lab, in one paragraph);
- experiment cards with their question, environments, status and one-line result, taken from the published studies;
- "How experiments are run";
- a colophon.

No numbers are introduced that are not in README.md or EXPERIMENTS.md.

### "How it works" (System One page)
- An inline SVG flow: state → System One → confident? → guard → act, with the other branch → System Two → act, where the state also becomes a training example.
- Short paragraphs follow the diagram's order.
- A paragraph explains the shares: they are measured over the last 1,000 moves. With untrained weights the network's confidence is low, so the planner decides almost everything. As training adds the escalated states, the network's confidence rises and System One's share grows. The threshold slider moves that balance live.
- A `<details>` element, open on first visit; its state is remembered in the browser.

### "This game" panel
Content lives in `web/explainers.ts`, one entry per game:
- `what`: the task and score;
- `network`: layers or ensemble;
- `inputs`: groups with count, meaning and encoding;
- `outputs`;
- `planner`;
- `guard`;
- `result`.

The panel is rendered when a game is selected, and the parameter count comes from the loaded model. Every statement is checked against the game's `encoding.ts`, planner and guard.
