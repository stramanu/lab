# Tasks

## 1. Data

- [x] 1.1 Add `scripts/handwriting-data.ts` (download from UCI, SHA-256 check, uppercase extraction, per-writer/letter report), `data/uji-upper.json` and `data/NOTICE.md`; the writer split and test guard in `src/handwriting/data.ts`; verify with tests: disjoint writers, test guard
- [x] 1.2 Add preprocessing and augmentation (`src/handwriting/preprocess.ts`); verify with tests: 32 points in [−1, 1], aspect kept, seeded augmentation

## 2. Recognisers

- [x] 2.1 Add both encodings and the MLP recogniser (training, temperature, top-k, cost); verify with tests: sizes and ranges, deterministic training, ≥ 95% train accuracy
- [x] 2.2 Add the $P recogniser (`src/handwriting/pdollar.ts`) with cost counting; verify with tests: own template at distance 0, stroke-order and direction invariance
- [x] 2.3 Write and run `experiments/handwriting-encoding.ts` (dev only); log the encoding decision in EXPERIMENTS.md

## 3. Study

- [x] 3.1 Add `scripts/handwriting-study.ts` (`pnpm hw:study`), run it, verify the JSON (runs, $P, aggregates, confusions, R1–R3)

## 4. Demo page

- [x] 4.1 Add the second Vite entry `web/handwriting/` (round pad, commit rule, display with alternatives, results panel, costs, 3D view, notice, links), and publish the weights and templates in `pnpm demo:data`
- [x] 4.2 Verify in the browser (Playwright): mouse and touch drawing, multistroke letter, correction, no requests carrying ink, no console errors, desktop and 375px; check that the site build serves `/systemone/handwriting/`

## 5. Write-up and release

- [x] 5.1 README handwriting section (results, R1–R3, limitations, references: Tappert et al. 1990, Plamondon & Srihari 2000, Guyon et al. 1991, Llorens et al. 2008, Vatavu et al. 2012, Simard et al. 2003), EXPERIMENTS.md; run typecheck, tests, build and strict validation; archive, commit and redeploy
