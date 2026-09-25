/**
 * What each game is, for the "This game" panel: the task and score, the network's inputs (grouped,
 * with their encoding) and outputs, the planner, the guard and the published result. Written from each
 * game's encoding.ts, planner and guard, and from docs/systemone.md; a test checks that the input groups add
 * up to the encoding size.
 */

export interface InputGroup {
  count: number;
  name: string;
  detail: string;
}

export interface Explainer {
  what: string;
  inputs: InputGroup[];
  outputs: string;
  planner: string;
  guard: string;
  result: string;
}

export const EXPLAINERS: Record<string, Explainer> = {
  snake: {
    what: 'Snake on a 20×20 board: eat as much food as possible without hitting a wall or yourself. Score = food eaten (at most 397).',
    inputs: [
      { count: 196, name: '7×7 window around the head', detail: 'Rotated so that "ahead" is always the top row. Each of the 49 cells is one-hot over empty, body, wall and food (4 values).' },
      { count: 4, name: 'Direction of the food', detail: 'How far the food is ahead, behind, to the left and to the right, in the same rotated frame, divided by the board size.' },
      { count: 1, name: 'Length', detail: 'The snake\'s length as a fraction of the board.' },
    ],
    outputs: '3 moves: straight, left, right. The network gives a probability to each; its confidence is the largest probability, after temperature scaling.',
    planner:
      'Simulates each move and scores it by safety (can the snake still reach its own tail afterwards?), progress towards the food along a shortest path, and the free area it can reach, with one step of lookahead. Cost: the cells its searches explore, about 1,000 per move.',
    guard: 'Plays the proposed move once and rejects it if the snake dies or can no longer reach its tail: a fragment of the planner run on a single move, a few dozen units.',
    result: 'Alone, the network reaches only 9% of the planner (a 7×7 window cannot see traps across the board). With the guard and a threshold of 0.7, the hybrid reaches 98% of the planner for 8.8× less compute; lower thresholds are cheaper but depend on the training run. Its confidence is well calibrated (ECE 0.008).',
  },
  lander: {
    what: 'A 2D lander with gravity, wind, limited fuel and rough terrain must touch down gently on the pad. Score = 100 + 50 × the fuel left on a safe landing, 0 otherwise.',
    inputs: [
      { count: 2, name: 'Position', detail: 'Horizontal distance from the pad centre, and height above the pad.' },
      { count: 2, name: 'Velocity', detail: 'Horizontal and vertical speed.' },
      { count: 3, name: 'Attitude', detail: 'Sine and cosine of the tilt angle, and the rotation speed.' },
      { count: 1, name: 'Fuel', detail: 'Fraction of the tank left.' },
      { count: 1, name: 'Wind', detail: 'The horizontal wind acting on the ship now.' },
      { count: 5, name: 'Terrain around', detail: 'Height of the ground relative to the ship at −8, −4, 0, +4 and +8 m.' },
      { count: 1, name: 'Over the pad', detail: '1 if the ship is above the landing pad, 0 otherwise.' },
      { count: 1, name: 'Clearance', detail: 'Height above the ground directly below.' },
    ],
    outputs: '4 actions: nothing, main engine, left thruster, right thruster. Confidence is the largest probability, after temperature scaling.',
    planner:
      'A rollout algorithm: for each first action (and short sequences of held actions) it lets a hand-written autopilot fly the rest of the descent in simulation, and keeps the best outcome. Because its simulation is exact and the autopilot\'s own choice is always a candidate, it lands whenever the autopilot would. Cost: physics steps simulated.',
    guard: 'Plays the proposed action for one decision, then a recovery policy for ten; rejects it if that ends in a crash or out of bounds.',
    result: 'The network reaches 83% of the planner, but the hand-written autopilot scores higher at the same cost: sometimes a rule is enough. The autopilot alternates engine on and off, so many actions are equivalent, which caps what imitation can learn.',
  },
  warehouse: {
    what: '16 robots carry loads between shelves and stations on a 32×20 grid for 300 timesteps. Robots decide one at a time, in a rotating order. Score = deliveries.',
    inputs: [
      { count: 243, name: '9×9 window around the deciding robot', detail: 'North is always up. Each of the 81 cells has 3 values: shelf or wall, another robot, the robot\'s own goal.' },
      { count: 3, name: 'Goal', detail: 'Direction of the goal (a unit vector) and its distance along the aisles.' },
      { count: 4, name: 'Next-step hints', detail: 'For north, east, south and west: how much closer or farther the goal gets by stepping there (+1 for a shelf or wall).' },
      { count: 2, name: 'Context', detail: 'Share of the other robots inside the window, and the fraction of the shift elapsed.' },
    ],
    outputs: '5 actions: wait, north, east, south, west. Confidence is the largest probability, after temperature scaling.',
    planner:
      'Cooperative space-time search: it predicts where the other robots will be over the next 8 timesteps, then searches a time-expanded map for the best path from each possible move of the deciding robot. Cost: nodes expanded, about 530 per move.',
    guard: 'Rejects a move into a shelf, into a cell another robot has claimed, a swap with another robot, or a step into a dead end that is not the goal.',
    result:
      'Alone, the network reaches 40% of the planner. The hybrid reaches 91% for 4.0× less compute, missing the 10× target, but with less compute than the planner with a shorter search window it delivers far more: 89.4 deliveries against 60.1. Its confidence is well calibrated (ECE 0.018). A known limitation: as an episode goes on the fleet often ends in gridlock, with the planner too, because the planner has no deadlock resolution.',
  },
  racing: {
    what: 'A car on a procedural closed track, with a grip limit: take the corners too fast and it leaves the track. Score = metres of track covered in 60 s.',
    inputs: [
      { count: 1, name: 'Speed', detail: 'The car\'s speed.' },
      { count: 3, name: 'Pose on the track', detail: 'Sine and cosine of the angle between the car and the track, and the sideways offset from the centreline.' },
      { count: 1, name: 'Steering', detail: 'The steering angle currently commanded.' },
      { count: 7, name: 'Track ahead', detail: 'Where the centreline is 5, 10, 20, 30, 45, 60 and 80 m ahead, measured sideways in the car\'s frame.' },
      { count: 5, name: 'Curvature ahead', detail: 'How sharply the track bends 10, 20, 30, 45 and 60 m ahead.' },
      { count: 3, name: 'Speed headroom', detail: 'Current speed divided by the fastest safe speed for the tightest bend within 20, 40 and 60 m.' },
    ],
    outputs:
      '2 continuous values: the steering target and the pedal (−1 brake … +1 gas). System One is an ensemble of 5 such networks: the car follows their mean, and their disagreement sets the confidence.',
    planner:
      'Simulates 6 commands (steer left, hold or right, with gas or brake), each followed by a hand-written pure-pursuit driver at several speed margins for the next 4 s, and keeps the one that covers the most track. Cost: physics steps, about 5,800 per move.',
    guard: 'Plays the proposed action for one decision, then the base driver for 1 s; rejects it if the car would leave the track.',
    result:
      'The network alone drives 99.9% as far as the planner for 1,164× less compute; with the guard, 102% for 97× less. It agrees with the planner on only 51% of decisions, because several actions are about equally good, and its confidence is poorly calibrated (ECE 0.27).',
  },
  quadruped: {
    what: 'A 12-joint four-legged robot in 3D rigid-body physics (Rapier) trots forward for 20 s while pushes hit it; the ground friction changes from run to run. Score = metres walked; a fall ends the run.',
    inputs: [
      { count: 1, name: 'Height', detail: 'Height of the trunk above the ground.' },
      { count: 3, name: 'Tilt', detail: 'Direction of gravity as seen from the trunk.' },
      { count: 2, name: 'Heading', detail: 'Sine and cosine of the direction the robot faces.' },
      { count: 6, name: 'Motion', detail: 'Trunk velocity and rotation speed, in the trunk\'s frame.' },
      { count: 12, name: 'Joint angles', detail: 'Hip sideways, hip and knee angle of each of the 4 legs.' },
      { count: 12, name: 'Joint speeds', detail: 'How fast each of those 12 joints is moving.' },
      { count: 4, name: 'Foot contacts', detail: '1 for each foot touching the ground.' },
      { count: 2, name: 'Gait phase', detail: 'Where the trot is in its cycle (sine and cosine).' },
      { count: 4, name: 'Last action', detail: 'The 4 modulations applied in the previous decision.' },
    ],
    outputs:
      '4 continuous modulations of a hand-written trot: forward and sideways foot placement, body height and step frequency (0 leaves the trot unchanged). As in racing, System One is an ensemble of 5 networks: the robot follows their mean, and their disagreement sets the confidence.',
    planner:
      'From a snapshot of the physics, it tries 21 modulations for 0.1 s, each followed by the hand-written trot, 1 s per rollout in total, and scores the metres gained minus a penalty for tilting (and a large one for falling). It does not see future pushes. Cost: physics steps, about 4,100 per move.',
    guard: 'Plays the proposed modulation for 0.1 s, then the plain trot for 0.1 s; rejects it if the robot would fall or tilt beyond 45°.',
    result:
      'Alone, the network walks 88% as far as the planner for 1/820 of the compute, and falls less often than the hand-written trot (12–23 against 67 falls in 200 runs). With the guard, it walks 91% as far as the planner with about as few falls, for 82× less compute. It agrees with the planner on only 41% of decisions, because several modulations are about equally good, and its confidence is poorly calibrated when it acts alone (ECE 0.23). The experiment went ahead after failing its feasibility test (60% imitation, target 85%), and says so. On hills it never saw, the network alone covers only 70–73% of the planner\'s distance, but it also becomes less confident, so the hybrid hands more decisions to the planner by itself and keeps 94–99% of its distance (exploratory, dev seeds).',
  },
};
