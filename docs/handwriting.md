# Handwriting pad: a tiny network against a classic recogniser

Can a network with 22,298 parameters read uppercase letters written one at a time with a finger, as on a
car's touchpad, as well as a classic recogniser that compares the letter with every stored example?

Live: <https://lab.emanuelestrazzullo.dev/handwriting/>. The decision log is [EXPERIMENTS.md](../EXPERIMENTS.md)
(decisions 22–23).

Writing one character at a time with a finger, as on the touchpad of a car's rotary controller, is **online
handwriting recognition**: the input is the pen trajectory [1, 2]. A small network reading characters on a
touch terminal is one of the oldest applications of neural networks [3]. Here there is no planner to
imitate: the MLP is trained on the true labels, and its reference is **$P** [5], a training-free
recogniser that is invariant to stroke order and direction and compares the input with every stored example.

- **Data**: the 26 uppercase letters of UJI Pen Characters v2 [4] (60 writers, 2 samples per letter,
  stylus on a tablet PC; CC BY 4.0), 3,120 samples. The split is by writer and follows the database's own:
  its 20 "tst" writers are the test set (1,040 letters); of its 40 "trn" writers, 10 are dev and 30 train.
- **Network**: the lab's from-scratch MLP (256 → 64 → 64 → 26, 22,298 parameters) on a 16×16 raster of
  the ink, trained for 60 epochs with train-only affine distortions and jitter [6], temperature-scaled on
  dev writers [7]. The raster encoding was chosen over a trajectory encoding on dev by a rule fixed in
  advance; the two were tied (88.7% each, `pnpm exp handwriting-encoding`).
- **$P** uses all 1,560 training letters as templates: the same letters the network is trained on.
- **Cost**: 2 operations per multiply–accumulate for the MLP, and 5 per point-to-point distance for $P (its
  square root is not counted, which favours $P).

Test writers, 5 training runs (`pnpm hw:study`, about 1 minute; times are wall-clock on the reference machine, including preprocessing):

| Recogniser | Top-1 | Top-3 | Operations per letter | Time per letter (Node) |
| --- | --- | --- | --- | --- |
| **MLP** | **83.9% ± 0.8** | **92.7%** | **44,288** | 0.05 ms |
| $P, 1,560 templates | 83.2% | 94.6% | 57,657,600 | 73 ms |

| | Measured | Outcome | Holds in |
| --- | --- | --- | --- |
| R1: MLP top-1 ≥ 90% | 83.9% | not confirmed | 0/5 runs |
| R2: MLP top-1 ≥ $P's − 3 points, at ≥ 100× lower cost | 83.9% vs 83.2%, 1,302× cheaper | **confirmed** | 5/5 runs |
| R3: ECE after temperature scaling ≤ 0.05 | 0.054 → 0.019 | **confirmed** | 5/5 runs |

The network is as accurate as the classic recogniser on its first answer, for 1/1,300 of the arithmetic, and
its confidence is well calibrated, but neither reaches 90% on writers they have never seen. Test writers are harder than dev
writers (88.7% on dev). The network's most frequent mistakes are I read as J (15% of the I's), H as M, R as K,
A as Q and D as O (7–8% each); $P is better in the top 3 (94.6% vs 92.7%). On the in-browser pad
accuracy may be lower still: the data was written with a stylus, and a finger writes differently.

## Reproduce

```sh
pnpm hw:data                    # downloads UJI Pen Characters v2, checks its SHA-256, writes data/uji-upper.json
pnpm exp handwriting-encoding   # the encoding choice, on dev writers
pnpm hw:study                   # the final study on the 20 test writers (~1 min)
```

## The page

`/handwriting/`: a round touchpad for finger, pen or mouse, the network's top-5 letters with tap-to-correct
alternatives, $P running in a Web Worker on the same templates as the study, the cost of both per letter,
the 3D forward pass, and the published results. The ink never leaves the browser.

## References

1. Tappert, C. C., Suen, C. Y., & Wakahara, T. (1990). The State of the Art in On-Line Handwriting Recognition. *IEEE Transactions on Pattern Analysis and Machine Intelligence*, 12(8), 787–808.
2. Plamondon, R., & Srihari, S. N. (2000). On-Line and Off-Line Handwriting Recognition: A Comprehensive Survey. *IEEE Transactions on Pattern Analysis and Machine Intelligence*, 22(1), 63–84.
3. Guyon, I., Albrecht, P., Le Cun, Y., Denker, J., & Hubbard, W. (1991). Design of a Neural Network Character Recognizer for a Touch Terminal. *Pattern Recognition*, 24(2), 105–119.
4. Llorens, D., Prat, F., Marzal, A., Vilar, J. M., Castro, M. J., et al. (2008). The UJIpenchars Database: a Pen-Based Database of Isolated Handwritten Characters. *LREC 2008*. Data: UCI Machine Learning Repository, https://doi.org/10.24432/C5FG8S (CC BY 4.0).
5. Vatavu, R.-D., Anthony, L., & Wobbrock, J. O. (2012). Gestures as Point Clouds: A $P Recognizer for User Interface Prototypes. *ICMI 2012*.
6. Simard, P. Y., Steinkraus, D., & Platt, J. C. (2003). Best Practices for Convolutional Neural Networks Applied to Visual Document Analysis. *ICDAR 2003*.
7. Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). On Calibration of Modern Neural Networks. *ICML 2017*.
