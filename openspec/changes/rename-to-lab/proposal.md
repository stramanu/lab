# Proposal

## Why

The project started as one experiment (System One) and became a lab. It now has two experiments, a lab home
at the site root, and a Cloudflare Worker already named `lab`. The package, the folder and the README still
present everything as "System One", and the handwriting pad sits inside the System One README.

## What Changes

- The package is renamed `lab`. The working folder is renamed `lab` once the running quadruped study has
  finished, because a running study depends on its folder path.
- README.md becomes the lab's page: what the lab is, the experiments with their questions and headline
  results, how experiments are run, how to reproduce, the site's paths and the layout.
- One write-up per experiment in `docs/`. `docs/systemone.md` has the background, protocol, results, the
  four regimes, limitations, reproduction, the page and references 1–33 as before.
  `docs/handwriting.md` has the handwriting section and its references, renumbered 1–7.
- The pages' footers point to the experiment's write-up.
- Preparation for publishing the repository:
  - an MIT licence for the code (the derived dataset keeps CC BY 4.0);
  - package metadata (description, licence, author, homepage);
  - a CI workflow (typecheck, tests and build on every push);
  - the local Claude Code commands in `.claude/` are no longer tracked;
  - `web/main.ts` (712 lines) is split into modules: `dom`, `decision-window`, `racing-extras`,
    `lander-wind`, `planner-worker-client`, `training-panel`, `frontier-panel` and `explainer-panel`.
    Behaviour is unchanged, checked in the browser on all five games.
- An audit before publishing found no secrets, no personal paths and no e-mail addresses in the tracked
  files or in the git history. The author chose to keep the commit author address as it is.

No behaviour changes; the site URLs stay the same.

## Capabilities

### New Capabilities
<!-- None: documentation and naming only. -->

### Modified Capabilities
<!-- None. -->

## Impact

- `package.json`, `README.md`, `docs/`, the two pages' footers, and the working folder name. The folder
  rename happens after the study.
