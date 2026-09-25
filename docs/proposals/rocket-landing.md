# Proposal: landing a rocket booster, with a network under a safety monitor

Status: **proposed**, after the quadruped with vision. Nothing here is pre-registered yet. Targets and
go/no-go criteria are fixed in an OpenSpec change before any measurement.

## Why

**The real system.** Orbital-class boosters, such as SpaceX's Falcon 9 first stage, land propulsively,
guided by an optimiser solved on board in real time. It is powered-descent guidance posed as a convex
problem:
- Açıkmeşe & Ploen (2007) introduced the approach;
- Açıkmeşe, Carson & Blackmore (2013) proved that the non-convex constraints can be convexified without
  loss;
- Blackmore (2016) describes how it is used to land rockets.

**Why the optimiser is trusted.** Whenever the landing is feasible, it returns a trajectory that
respects every constraint: thrust bounds, glide slope, fuel.

**The tension.** Neural networks can imitate such optimal controllers at a fraction of the compute
(Sánchez-Sánchez & Izzo 2018; see the survey by Izzo, Märtens & Pan 2019). That matters where onboard
computers are slow and energy is scarce: planetary and lunar landers, small vehicles, drones. But a
network cannot be certified, and nobody would let one fly a rocket alone.

**How aerospace already handles untrusted controllers: runtime assurance.** In the Simplex architecture
(Sha 2001):
- a complex, unverified controller flies;
- a simple, verifiable monitor watches it;
- control switches to a safe, verified controller when the monitor is not satisfied.

The same pattern underlies standards for bounding the behaviour of complex functions in unmanned
aircraft (ASTM F3269).

**This lab's System One / System Two is that pattern:**
- **System One:** a tiny network that flies the booster by imitating the optimal guidance. It is fast
  and unverified.
- **Guard:** the monitor. It checks that the network's command respects the constraints and that a safe
  landing remains reachable.
- **System Two:** the optimiser, the trusted fallback. It takes over when the network is unsure or the
  guard rejects its command.

**The question:**

> How much of a landing can a tiny network fly under a safety monitor, and does its confidence tell the
> monitor when to hand control back, including in conditions it never saw?

This is the question of the quadruped terrain spike (decision 37), where the network noticed that it was
out of its depth. Here it is asked in a domain where noticing is a matter of safety.

**What we do not claim.** That SpaceX needs this: their flight computer is ample. The claim is narrower
and honest: this is the pattern aerospace uses to make learned controllers safe, built and measured, in a
browser, on a problem everyone recognises.

## Design sketch

- **Vehicle.**
  - A booster as a rigid body in 3D (6 degrees of freedom) with a gimballed main engine: throttle
    between a minimum and a maximum thrust, since the engine cannot throttle to zero, and a gimbal angle
    limit.
  - Mass that decreases with fuel burn; aerodynamic drag.
  - Optionally cold-gas attitude thrusters.
- **Scenario.**
  - The final descent from a few kilometres to touchdown, on a pad or a drone ship that heaves and
    pitches.
  - Seeded disturbances: wind and gusts, thrust dispersion (±x%), mass error, initial state dispersion.
- **System Two, in candidate order.**
  1. Convex powered-descent guidance, the 3-DoF translational problem solved as a second-order cone
     programme and re-solved at a fixed rate (model predictive control), with an attitude controller
     tracking the commanded thrust direction.
  2. Successive convexification for 6-DoF (Szmuk & Açıkmeşe 2018), if feasible.
  3. Fallback if a from-scratch cone solver is too slow in TypeScript: sampling-based MPC (MPPI, Williams
     et al. 2016). It is less elegant, but robust and simple.
  - Cost is counted in solver iterations or simulated steps, as for the other planners.
- **System One.** A small MLP ensemble that regresses the thrust vector (magnitude and direction) from
  the relative state (position, velocity, attitude, rates, mass, fuel, pad motion), with confidence from
  ensemble disagreement, as for racing and the quadruped.
- **Guard (the monitor).** A cheap check of the network's command:
  - thrust and gimbal within bounds;
  - glide-slope cone respected over a short rollout;
  - a reachability test, meaning a safe landing still exists from the predicted state (for example a
    quick feasibility check, or a conservative closed-form bound).
- **Page.**
  - A 3D booster descending onto a drone ship, the plume coloured by who is flying (network, monitor
    override, optimiser).
  - Visitor gusts, and a "planner off" switch to watch the network alone.

## Measures (candidates for pre-registered targets)

- **Landing:** success, touchdown speed and attitude, position error, fuel used.
- **Constraints:** violations, targeted at zero with the monitor on.
- **Share and cost:** the share of the descent flown by the network, and compute per decision against the
  optimiser.
- **Calibration and out of distribution:** calibration of the network's confidence, and the rise in
  escalation under disturbances beyond the training distribution (stronger gusts, thrust loss).

## Feasibility spike (criteria to fix before running)

- **Solver speed and correctness.** The chosen System Two solves a guidance problem fast enough to be
  re-solved at least 5–10 times per simulated second in the browser. Its trajectories land on at least
  90% of dev seeds under nominal disturbances.
- **Imitation.** A small network imitating it agrees within tolerance on a set share of dev states.
- **The monitor is cheap:** less than a tenth of the optimiser's cost.

## Risks

- **A robust second-order cone solver from scratch in TypeScript is the main technical risk.** A
  primal-dual interior point method is feasible but delicate. Embedded solvers such as ECOS (Domahidi,
  Chu & Boyd 2013) and generated code such as CVXGEN (Mattingley & Boyd 2012) show what is needed.
  Mitigation: MPPI as System Two.
- **Realism must stay honest.** It is a simplified booster, not Falcon 9 data, and the write-up says so.

## References

- Açıkmeşe, B., & Ploen, S. R. (2007). Convex Programming Approach to Powered Descent Guidance for Mars Landing. *Journal of Guidance, Control, and Dynamics*, 30(5), 1353–1366.
- Açıkmeşe, B., Carson, J. M., & Blackmore, L. (2013). Lossless Convexification of Nonconvex Control Bound and Pointing Constraints of the Soft Landing Optimal Control Problem. *IEEE Transactions on Control Systems Technology*, 21(6), 2104–2113.
- Blackmore, L. (2016). Autonomous Precision Landing of Space Rockets. *The Bridge*, 46(4), 15–20. National Academy of Engineering.
- Szmuk, M., & Açıkmeşe, B. (2018). Successive Convexification for 6-DoF Mars Rocket Powered Landing with Free-Final-Time. *AIAA Guidance, Navigation, and Control Conference*.
- Sánchez-Sánchez, C., & Izzo, D. (2018). Real-Time Optimal Control via Deep Neural Networks: Study on Landing Problems. *Journal of Guidance, Control, and Dynamics*, 41(5), 1122–1135.
- Izzo, D., Märtens, M., & Pan, B. (2019). A Survey on Artificial Intelligence Trends in Spacecraft Guidance Dynamics and Control. *Astrodynamics*, 3(4), 287–299.
- Gaudet, B., Linares, R., & Furfaro, R. (2020). Deep Reinforcement Learning for Six Degree-of-Freedom Planetary Landing. *Advances in Space Research*, 65(7), 1723–1741.
- Sha, L. (2001). Using Simplicity to Control Complexity. *IEEE Software*, 18(4), 20–28.
- ASTM F3269-17 (2017). Standard Practice for Methods to Safely Bound Flight Behavior of Unmanned Aircraft Systems Containing Complex Functions. ASTM International.
- Williams, G., Drews, P., Goldfain, B., Rehg, J. M., & Theodorou, E. A. (2016). Aggressive Driving with Model Predictive Path Integral Control. *ICRA 2016*.
- Domahidi, A., Chu, E., & Boyd, S. (2013). ECOS: An SOCP Solver for Embedded Systems. *European Control Conference 2013*.
- Mattingley, J., & Boyd, S. (2012). CVXGEN: A Code Generator for Embedded Convex Optimization. *Optimization and Engineering*, 13(1), 1–27.
