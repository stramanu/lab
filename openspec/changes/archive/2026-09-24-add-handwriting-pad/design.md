# Design

## Context

See proposal.md. Unlike the games, there is no planner to imitate: the labels are the true characters, and the question is how a tiny network compares with a classic, training-free recogniser that is accurate but costly. The existing MLP, Adam, temperature scaling, ECE, t-intervals and 3D network view are reused unchanged.

## Decisions

### Dataset and split
- Source: UJI Pen Characters v2, `ujipenchars2.txt` from the UCI archive (CC BY 4.0). The download script records the SHA-256 of the archive and fails if it changes.
- Subset: samples labelled with an uppercase ASCII letter A–Z. Expected size: 60 writers × 26 letters × 2 = 3,120. The script reports any missing or extra samples instead of silently dropping them.
- The split is by writer, as fixed in the proposal. Test is the database's 20 "tst" writers. Dev is every 4th of its 40 "trn" writers sorted by ID (index mod 4 = 0), and the other 30 are train. Following the database's documented split keeps the test set comparable with other work. Test writers are used only by the study script, as test seeds are in the games.
- Source format: `WORD <char> <set>_<site>_W<nn>-<rep>` with integer points (100 units per mm, y downwards) and CRLF line endings. Writer = `<set>_<site>_W<nn>`.
- Derived file `data/uji-upper.json`: one entry per sample with the writer, the label and the strokes (integer coordinates as in the source), plus `data/NOTICE.md` with the attribution and the licence.

### Preprocessing (shared by both recognisers)
1. Join the strokes in writing order, keeping stroke boundaries.
2. Translate the bounding-box centre to the origin, then scale by the larger side to fit [−1, 1], keeping the aspect ratio (an "I" stays thin).
3. Resample to N = 32 points equidistant along the ink, not along pen-up jumps. Each resampled point keeps the index of its stroke.

### Encodings (the choice is made on dev by `pnpm exp handwriting-encoding`)
- **Trajectory** (160 values): for each of the 32 points, x, y, cos θ and sin θ of the local writing direction, and a stroke-start flag.
- **Raster** (256 values): the resampled polyline, drawn per stroke on a 16×16 grid; cell value = ink coverage, clamped to [0, 1].

The experiment trains both with the study's configuration on train writers, and reports dev top-1 accuracy and ECE for 3 seeds each. The encoding with the higher mean dev accuracy is used; the decision goes into EXPERIMENTS.md before the study runs.

### System One: MLP classifier
- Input → 64 → 64 → 26 with ReLU, He initialisation, Adam (learning rate 1e-3), batch 64, 60 epochs, cross-entropy on one-hot labels.
- **Augmentation**, train only, redrawn every epoch from the run's seeded stream, and applied before resampling:
  - rotation U(−10°, 10°);
  - independent x and y scale U(0.85, 1.15);
  - shear U(−0.2, 0.2);
  - point jitter N(0, 0.01).
- **Calibration**: a temperature is fitted on dev writers (Guo et al. 2017), and ECE is reported with 15 bins (Naeini et al. 2015).
- **Cost**: multiply–accumulates of the forward pass (Σ in × out over layers), counted as 2 operations each; ReLU and softmax are not counted.

### Classic baseline: $P (Vatavu, Anthony & Wobbrock 2012)
- The published algorithm, with its own normalisation: resample to 32 points along the ink (the same resampling as the MLP), scale by the larger side, translate to the centroid. Then a greedy cloud match started every ⌊n^(1−ε)⌋ points (ε = 0.5), in both matching directions, with decreasing weights.
- **Templates**: every training sample (1,560). This is the strongest configuration of $P that the same training data allows; it becomes a nearest-neighbour classifier.
- **Top-k**: the classes of the k nearest distinct-class templates. Its "confidence" is not a probability, so ECE is not reported for $P.
- **Cost**: point-to-point distance evaluations, counted as 5 operations each (2 subtractions, 2 multiplications, 1 addition). The square root is not counted, which favours $P. Expected size: about 10⁷ evaluations per recognition, against about 10⁴ multiply–accumulates for the MLP.

### Study
`pnpm hw:study` runs 5 training runs (run seed r = 1…5, which controls initialisation, augmentation and batch order) and evaluates each run's MLP on the 1,040 test samples. $P is deterministic and evaluated once. Output: `artifacts/handwriting/study/study-test.json` with:
- per run: top-1, top-3, ECE before and after temperature scaling, and cost;
- aggregated means with Student-t 95% intervals;
- the confusion matrix of the mean predictions, and the 10 most frequent confusions;
- R1–R3 with a per-run tally.

### Demo page (`web/handwriting/index.html`, a second Vite entry)
- **Pad.** A round touch surface drawn on a canvas, sitting as a dark "device" on the site's paper background. Input uses pointer events with `touch-action: none` and pointer capture; only the first active pointer draws.
- **Commit rule.** A letter is recognised 600 ms after the last pointer-up. A stroke that starts within that time belongs to the same letter, so multistroke letters (E, H, T…) work.
- **Display.** The text field above the pad receives the recognised letter. Three candidate chips offer the top-3 alternatives; tapping one replaces the letter. There are space, backspace and clear buttons.
- **Results panel:**
  - the MLP's top-5 probabilities as bars;
  - $P's top-3;
  - whether they agree;
  - cost per recognition for both (operations, and time measured in this browser).
- **3D view.** The real forward pass for the last letter, reusing `network-view.ts`. The raster encoding maps to the existing window layout (16 × 16, 1 channel). The trajectory encoding needs a small new layout: a 32 × 5 grid.
- **Data.** `handwriting-weights.json` (study run 1, the same rule as the games) and `handwriting-templates.json` (the preprocessed training templates for $P, loaded after the page is interactive).
- **Footer.** Data attribution (UJI Pen Characters v2, CC BY 4.0), and a note that ink never leaves the browser.
- **Navigation.** Links between the games page and the handwriting page.

## Risks / Trade-offs

- [Finger input differs from the stylus data in the dataset (thicker, shakier, larger)] → preprocessing normalises scale and resamples; augmentation adds jitter and shear. The study measures stylus writers only, and the README says browser use is a qualitative demo, not a measured result.
- [30 training writers is small for writer independence] → augmentation, and a small network. The study reports the interval and the most frequent confusions, and R1 may fail; that is a result.
- [$P with 1,560 templates is slow in the browser (about 10⁷ distance evaluations)] → it is exactly the cost we want to show, and it takes about 75 ms in Node on the reference machine. The page runs $P in a Web Worker, so the pad never freezes, and measures and displays its time.
- [Look-alike uppercase pairs (O/Q, U/V, I/J) cap accuracy] → the top-3 chips address this in the UI, as in-car systems do; the study reports top-3 as well.
