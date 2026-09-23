# Design

## Context

The demo (`web/`) is hard-wired to Snake: `main.ts` builds `SnakeEnv`, `SnakeTeacher` and `SnakeGuard`, and the worker trains Snake only. The game registry (`src/games/registry.ts`) is browser-safe and already describes both games. The study JSON files are the published results. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:** one page, any registered game with published data; an honest 3D view of the live forward pass; results that match the README.

**Non-Goals:** a framework rewrite of the page, new games, deployment.

## Decisions

### Per-game UI adapter
`web/games.ts` maps a registry name to UI pieces: `createView(canvas)` (the Snake `GameView` or the new `LanderView`), `networkLayout` (how inputs are placed in 3D), `plannerLevel`, and labels. The registry stays UI-free; the adapter is the only per-game code in `web/`. The worker receives the game name and builds the pipeline from the registry, with `game.pipeline` defaults.

### Lander view
Canvas 2D in world coordinates scaled to fit. It draws the terrain polyline, the pad in the System One color, the ship as a small lander silhouette rotated by its angle, flames for the action just played (main engine below, side jets), a wind arrow scaled by the current wind, and a fading trail of recent positions colored by decider, like Snake's trail.

### 3D network view (three.js)
- **Library.** `three` (MIT) is a runtime dependency. The view is presentation only, not part of the method, and hand-writing a WebGL scene graph would add code without scientific value. It is loaded with a dynamic `import()` so the rest of the page does not wait for it.
- **Data.** `Mlp.trace(x)` returns `{ input, h1, h2, logits }` (copies) from the same forward pass used by `probs`. The page calls it on the state the hybrid just decided on. This is one extra forward pass per displayed decision, for display only, and is not counted in the cost.
- **Layout.**
  - Input plane at z = 0. For Snake, the 7×7 window is a 7×7 grid; each cell's node takes the color of its active category (empty, body, wall, food), and the 5 extra inputs sit in a row below. For the lander, the 16 inputs form a labeled column.
  - Hidden layers at z = 1 and z = 2 as 8×8 grids of spheres. Emissive intensity is the activation divided by the layer's running max.
  - Outputs at z = 3 as labeled spheres sized by probability; the chosen action is ringed in the decider color; the threshold is a dashed ring.
- **Edges.** For each transition, compute the contribution `w_ji · a_i` for all pairs and draw the top K by magnitude (K = 120 input→h1, 120 h1→h2, 24 h2→out) as `LineSegments` with per-vertex colors: warm for positive, cool for negative, opacity by magnitude. Buffers are preallocated and updated in place.
- **Cost of drawing.** Updates are throttled to about 12 per second, whatever the game speed. Rendering stops while the panel is off-screen (IntersectionObserver) or the tab is hidden. If WebGL cannot start, the panel shows a message.
- **Interaction.** OrbitControls (from `three/examples/jsm`) with damping, and a slow auto-rotate that stops on interaction.

### Frontier from studies
`web/frontier.ts` takes the study JSON (aggregated conditions) and returns points with mean cost, mean score and the score interval. The scatter draws vertical error bars. The H2 target region is derived from the study's reference planner condition. The report schema differences are handled in `frontierPoints` so the chart code does not change.

### Data publishing
`pnpm demo:data` copies, for every registered game, `artifacts/<game>/study/run-1/weights.json` → `web/public/data/<game>-weights.json` and `study-test-200.json` → `<game>-study.json`. The old `snake-eval-report.json` is removed.

## Risks / Trade-offs

- [Bundle size: three.js adds ~150 KB gzipped] → loaded lazily, only for the network panel.
- [Edge computation per update: Snake has 201×64 + 64×64 + 64×3 ≈ 17k contributions] → trivial at 12 updates per second.
- [Readers may think the 3D view is the cost of System One] → a caption states that the view re-runs the forward pass for display and is not counted.
