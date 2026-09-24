# Proposal

## Why

Many cars let the driver write one character at a time with a finger on a small touchpad, often on top of the rotary controller, to enter a destination or a contact name. This is **online handwriting recognition**: the input is the pen trajectory, not an image (Tappert, Suen & Wakahara, IEEE TPAMI 1990; Plamondon & Srihari, IEEE TPAMI 2000). A small neural network recognising characters written on a touch terminal is one of the earliest applications of neural networks (Guyon et al., Pattern Recognition 1991).

It fits this repository's question from a different angle. The games asked whether a tiny network can replace an expensive planner. Here the network must compete with a classic, training-free recogniser that compares the input with every stored example. Can a ~20k-parameter MLP match that recogniser's accuracy for a fraction of its cost, on writers it has never seen?

## What Changes

- **Data.** The UJI Pen Characters v2 database (Llorens et al., LREC 2008; UCI Machine Learning Repository, CC BY 4.0): 60 writers, 2 samples of each character per writer, recorded with a stylus on a tablet PC. We use the 26 uppercase letters A–Z: 3,120 samples.
  - A script downloads the archive, checks its hash, extracts the uppercase letters, and writes a compact derived file with attribution. The derived file is committed.
  - **Writer-independent split, fixed here.** The database's own documented split: its 20 "tst" writers are our test set (1,040 samples). Its 40 "trn" writers are divided, sorted by ID, into dev (every 4th writer, 10 writers, 520 samples) and train (30 writers, 1,560 samples). No writer appears in two splits.
- **Preprocessing.** Strokes are joined in writing order, centred, scaled to a unit box with the aspect ratio kept, and resampled to a fixed number of equidistant points.
- **Two input encodings, chosen on dev only.** A trajectory encoding (points with position, direction and stroke starts) and a 16×16 raster of the ink. A committed dev experiment compares them; the choice is logged before any test evaluation.
- **System One: an MLP classifier** (the existing from-scratch MLP, 26 softmax outputs, cross-entropy on the true labels), trained with train-only geometric augmentation, a standard practice for handwriting (Simard, Steinkraus & Platt, ICDAR 2003). Temperature scaling on dev writers (Guo et al., ICML 2017).
- **Classic baseline: the $P recogniser** (Vatavu, Anthony & Wobbrock, ICMI 2012). It is training-free, multistroke, and invariant to stroke order and direction, and it uses every training sample as a template. Its cost grows with the number of templates.
- **Cost** is counted in the same spirit as the games: multiply–accumulate operations for the MLP forward pass, and point-to-point distance evaluations for $P, each converted to arithmetic operations.
- **Pre-registered targets** (mean of 5 training runs, 20 test writers):
  - **R1**: MLP top-1 accuracy ≥ 90%.
  - **R2**: MLP accuracy at least $P's minus 3 points, at ≥ 100× lower cost per recognition.
  - **R3**: after temperature scaling, ECE ≤ 0.05.

  They are our own choices, fixed before measuring, and negative results are reported.
- **A study script** runs the 5 training runs, evaluates both recognisers once on the test writers, and writes one JSON file with top-1 and top-3 accuracy, ECE, cost, and the most frequent confusions, with 95% intervals.
- **Demo page** at `/systemone/handwriting/`. A round touchpad, inspired by in-car rotary touch controllers, takes finger, pen or mouse input. It supports multistroke letters, with automatic commit after a short pause. It shows:
  - the recognised text and the top-3 alternatives, which can be tapped to correct;
  - both recognisers' answers and costs;
  - the network's forward pass in the 3D view.

  Everything runs in the browser, and nothing written is sent anywhere.

Out of scope: lowercase letters and digits, words or cursive writing, and personalising the model on the user's own writing.

## Capabilities

### New Capabilities
- `handwriting-data`: dataset acquisition, uppercase subset, writer-independent split, preprocessing and augmentation.
- `handwriting-recognizer`: the MLP classifier, its encodings and calibration, the $P baseline, cost accounting, and the study with its targets.
- `handwriting-pad`: the browser touchpad page, with stroke capture, commit rule, results, and the 3D network view.

### Modified Capabilities
<!-- None: the MLP, calibration, statistics and 3D view are reused unchanged. -->

## Impact

- New `src/handwriting/`, `scripts/handwriting-*.ts`, `experiments/handwriting-encoding.ts`, `data/` (derived dataset and NOTICE), and `web/handwriting/` (a second Vite page).
- README: a handwriting section with results and references. EXPERIMENTS.md: the encoding decision and the study.
- There is no new runtime dependency.
