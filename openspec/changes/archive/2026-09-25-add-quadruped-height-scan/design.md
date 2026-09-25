# Design

## Sensor

- **Grid.** Points in the trunk's heading frame, meaning yaw only, so the grid stays level:
  - 11 rows along the heading, from −0.2 m to +0.8 m in 0.1 m steps;
  - 7 columns across, from −0.3 m to +0.3 m.
- **Value per point:** (trunk height − ground surface height at the point − nominal standing height) /
  0.1 m. On flat ground, in the standing pose, every value is 0.
- **Ground surface.** The analytic surface of the terrain, hills and branches (`surfaceHeight`). The
  terrain tests show that it matches the physics ground under vertical ray casts within 1 cm on hills
  and 3 mm on branches. It is used instead of ray casts because it is exact, deterministic and cheap.
- **No noise in this spike.** Sensor noise and dropout are a later, declared question.
- **Encoding.** 46 proprioceptive values followed by the 77 scan values: 123 in total. With the sensor
  off, the encoding is unchanged.

## Spike protocol (fixed before any measurement)

1. **Data.**
   - 300 planner-driven episodes (level 2) on `varied` terrain, with the calibrated parameters and pushes
     (8 N·s).
   - Training seeds from 4,000,000.
   - Each state is recorded with the scan. The blind network uses its first 46 values, so both networks
     see the same states and labels.
2. **Networks.**
   - Two ensembles, 5 × 256×256, trained identically on those states: 12 epochs, the same shuffling seed.
   - Confidence maps fitted on 20 further planner-driven episodes, from seed 4,100,000.
   - No escalation loop: this isolates the effect of perception.
3. **Evaluation**, on dev seeds 10001–10040, on flat, hills and mixed terrain, with pushes.
   - Each network alone: distance and falls.
   - The planner, level 2, for reference.
   - Agreement with the planner (every component within 0.25) and the AUROC of 1 − confidence, on the
     planner-visited states of 10 dev episodes per terrain (seeds 10041–10050).

## Go / no-go criteria (all on dev seeds)

- **C1, cost:** the scan adds less than 10% to the environment's time per decision.
- **C2, determinism:** encodings with the scan are bitwise identical across a snapshot and restore.
  Tested.
- **C3, imitation:** on hills and on mixed terrain, the scan network's agreement with the planner is at
  least 5 points above the blind network's.
- **C4, driving:** on hills, the scan network alone reaches at least 85% of the planner's distance.
  The blind flat network reached 73% in the terrain spike.
- **C5, no loss on flat:** on flat ground, the scan network alone reaches at least 95% of the blind
  network's distance.

If C3–C5 pass, a full study follows: the escalation loop, 5 runs and the test split, as a separate change
with its own targets. If they fail, the result is reported, and the next question is declared before
re-measuring: noise, a convolutional front-end, or a swing-height action.

## Revision before any measurement (2026-09-25): three networks, one of them modular

At the author's request, the main candidate becomes a **modular System One**: three networks joined and
trained end to end, as in perceptive locomotion on real robots (Miki et al. 2022). To tell the effect of
seeing apart from the effect of modularity, the spike trains three networks on the same data, with the
same epochs and seeds:

1. **Blind:** 46 → 256 → 256 → 4 per member (the ablation).
2. **Single, with scan:** 123 → 256 → 256 → 4 per member, 98,564 parameters (the control).
3. **Modular, with scan:** per member, 98,804 parameters (+0.2% over the control):
   - a scan encoder, 77 → 64 → 64 → 16;
   - a proprioceptive encoder, 46 → 64 → 64 → 32;
   - a motor network, 48 → 256 → 256 → 4.
   - The encoders' outputs are linear; the motor network receives both latents.

**Criteria**, unchanged in form:
- C3–C5 are judged for the modular network, the main candidate, and reported for the single one as well.
- C3 compares each against the blind network.
- **C6**, descriptive: the modular network against the single one, on agreement and on driving alone on
  hills and mixed terrain.

**What follows:** if the modular network passes C3–C5, the full study uses it. If only the single one
passes, the full study uses the single one, and the modular result is reported.
