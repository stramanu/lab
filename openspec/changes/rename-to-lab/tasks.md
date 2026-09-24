# Tasks

- [x] 1 Rename the package to `lab`; turn README.md into the lab's page; move the experiments' text into `docs/systemone.md` and `docs/handwriting.md`; point the pages' footers to the write-ups
- [x] 2 Prepare for publishing: MIT licence, package metadata, CI workflow, stop tracking `.claude/`, split `web/main.ts` into modules (browser check on all five games)
- [x] 3 Apply the verified findings of an external code review: per-episode seeding of the random baseline (and its parity check), study resume refuses runs trained with another configuration, dispose finished quadruped episodes in the continuous pipeline and on game switch, assert the bootstrap episode count, show the game's real iteration count while training in the tab, and three documentation fixes (conditions, intervals, quadruped sampling)
- [ ] 4 After the quadruped study: rename the working folder to `lab`, and move this project's notes with it; run typecheck, tests, build and strict validation
