# Proposal: a quadruped that sees the ground

Status: **proposed**, next in line (after the terrain retraining study). Nothing here is pre-registered
yet. Targets and go/no-go criteria are fixed in an OpenSpec change before any measurement.

## Why

The terrain spike (EXPERIMENTS.md, decision 37) showed a blind System One:
- its inputs are proprioceptive only (attitude, velocities, joints, foot contacts);
- on hills it covers 70–73% of the planner's distance and falls three times as often as on flat ground;
- the planner "sees" the terrain through its physics rollouts, so it barely notices the hills.

The network did notice that it was out of its depth: its ensemble confidence dropped, and the hybrid
escalated more. But it could not *act* on what it could not perceive.

Real legged robots solve this with exteroception and a teacher–student scheme:
- **Teacher** (Chen et al. 2019; Lee et al. 2020): a policy with privileged information, which sees the
  terrain perfectly.
- **Student:** a deployable policy that sees only what a real sensor would, trained to imitate the
  teacher.
- **Sensors in practice:** a height scan around the feet on ANYmal (Miki et al. 2022), a depth camera in
  Agarwal et al. (2022).

In the language of this lab, this is System Two teaching System One. The planner is the privileged
teacher; the network is the student with a sensor.

## Questions

1. **Does seeing close the gap?** With a height scan, does System One alone reach the planner on hills
   and branches, where the blind network reached 70–73%?
2. **Does confidence stay honest when perception can fail?** A sparse scan can miss a thin branch. Does
   the ensemble become less confident when what it sees and what it feels disagree, so that the hybrid
   escalates where the sensor is unreliable?
3. **What does perception cost?** Inputs, parameters and compute per decision, against the planner's
   cost and the blind network.

## Design sketch

- **Environment:** the current quadruped with the calibrated terrain (hills up to 16°, 1 branch per
  metre), unchanged. The sensor is added to the encoding. Proprioception stays, so the blind network is
  the ablation.
- **Sensor, level 1 (this lab, from scratch; implemented, change `add-quadruped-height-scan`):** a height
  scan on a grid in the trunk's heading frame: 11 × 7 points, 10 cm apart, from 0.2 m behind to 0.8 m
  ahead. Values are ground heights relative to the trunk.
  - It reads the terrain's analytic surface, which matches vertical ray casts on the physics ground within
    1 cm (terrain tests), so it is exact, deterministic and cheap.
  - Noise and dropout are a later, declared question.
  - Same seeds, same pushes, same planner.
- **Sensor, level 2 (the lab's "applied" side, later and optional):** a low-resolution depth image
  (for example 32 × 24) rendered on a GPU. It needs a renderer, and possibly MuJoCo Playground on Colab
  (Zakka et al. 2025).
- **System Two:** the current planner. It already "sees" the terrain through its rollouts.
- **System One:** the same ensemble with the scan appended to its inputs. A small convolutional front-end
  over the scan is an option, with the MLP as the baseline.
- **Training:** the existing continuous pipeline on varied terrain: planner-labelled bootstrap, then the
  escalation loop. The terrain study's fine-tuning results are the blind baseline.
  - The scan adds input units, so the published weights cannot be reused as they are.
  - A full study could start from them anyway, as in Net2Net (Chen et al. 2016): copy the weights of the
    46 proprioceptive inputs and set those of the new scan inputs to zero, so that training starts
    exactly from the blind network and learns to use the scan.
- **Page:** the scan points drawn around the robot in the 3D view, coloured by height, and a "sensor
  off" switch to watch the blind network.

## Follow-up question: one network or separate modules

Perceptive locomotion on real robots is usually modular:
- **ANYmal** (Miki et al. 2022):
  - a height-scan encoder and a proprioceptive encoder feed a belief module, which learns to trust
    perception less when it is unreliable;
  - a policy network then acts on that belief.
- **RMA** (Kumar et al. 2021): an adaptation module estimates the environment from recent history, and a
  base policy uses that estimate.
- **Hierarchical control** (e.g. DeepLoco, Peng et al. 2017): a high-level network sets goals, and a
  low-level network moves the legs.
- **Our quadruped is already two-level:** the network modulates a hand-written trot that plays the role of
  a pattern generator.

**Question:** at an equal number of parameters, does a modular System One beat a single network on the
concatenated inputs? The modular version has a scan encoder, a proprioceptive encoder and a fused
motor network, trained end to end.

The lab-specific twist is **uncertainty per module**. If the scan encoder is unsure (sensor noise, thin
branches) while the motor network is not, the robot could rely on proprioception instead of escalating to
the planner.

**What it needs:** end-to-end backpropagation through composed networks in the from-scratch library,
meaning input gradients passed between modules, with gradient-checking tests. It will be declared as its
own change after the height-scan spike.

## Feasibility spike (criteria to fix before running)

- **Physics and cost.** The scan adds less than 10% to the physics time per decision, and ray casts are
  bitwise deterministic across snapshot and restore.
- **Imitation.** On dev seeds with varied terrain, a scan-equipped ensemble trained like the blind one
  agrees with the planner more than the blind one does. A threshold will be set from the blind agreement
  on the same states.
- **Driving.** System One alone with the scan covers at least X% of the planner on hills, where X is
  set above the blind network's 70–73%.

## Risks

- **The hand-written trot may still be the bottleneck.** Seeing a branch does not help if the swing
  height cannot clear it. If so, a swing-height modulation would need to join the action (a new action
  dimension, a new network), which is declared before measuring.
- **The encoding grows** from 46 to about 120 values, so the network grows and the bootstrap needs more
  data.

## References

- Chen, D., Zhou, B., Koltun, V., & Krähenbühl, P. (2019). Learning by Cheating. *CoRL 2019*.
- Lee, J., Hwangbo, J., Wellhausen, L., Koltun, V., & Hutter, M. (2020). Learning Quadrupedal Locomotion over Challenging Terrain. *Science Robotics*, 5(47), eabc5986.
- Miki, T., Lee, J., Hwangbo, J., Wellhausen, L., Koltun, V., & Hutter, M. (2022). Learning Robust Perceptive Locomotion for Quadrupedal Robots in the Wild. *Science Robotics*, 7(62), eabk2822.
- Agarwal, A., Kumar, A., Malik, J., & Pathak, D. (2022). Legged Locomotion in Challenging Terrains using Egocentric Vision. *CoRL 2022*.
- Rudin, N., Hoeller, D., Reist, P., & Hutter, M. (2022). Learning to Walk in Minutes Using Massively Parallel Deep Reinforcement Learning. *CoRL 2021*, PMLR 164.
- Lakshminarayanan, B., Pritzel, A., & Blundell, C. (2017). Simple and Scalable Predictive Uncertainty Estimation using Deep Ensembles. *NeurIPS 30*.
- Zakka, K., et al. (2025). MuJoCo Playground. arXiv:2502.08844.
- Kumar, A., Fu, Z., Pathak, D., & Malik, J. (2021). RMA: Rapid Motor Adaptation for Legged Robots. *Robotics: Science and Systems (RSS) 2021*.
- Peng, X. B., Berseth, G., Yin, K., & van de Panne, M. (2017). DeepLoco: Dynamic Locomotion Skills Using Hierarchical Deep Reinforcement Learning. *ACM Transactions on Graphics*, 36(4), 41.
- Chen, T., Goodfellow, I., & Shlens, J. (2016). Net2Net: Accelerating Learning via Knowledge Transfer. *ICLR 2016*.
