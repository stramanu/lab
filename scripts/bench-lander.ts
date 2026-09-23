/** Measures the lander planner at several knob levels against a random player, on non-evaluation seeds. */
import { RandomPlayer } from '../src/core/players';
import { mean } from '../src/core/stats';
import { argmax } from '../src/core/types';
import { LanderEnv, LanderTeacher, pilotAction, type LanderTeacherConfig } from '../src/games/lander';
import { num, parseArgs } from './cli';

const args = parseArgs(process.argv.slice(2));
const n = num(args, 'seeds') ?? 50;
const seeds = Array.from({ length: n }, (_, i) => 5000 + i);
const levels: Array<Partial<LanderTeacherConfig>> = args.levels
  ? JSON.parse(args.levels)
  : [
      { depth: 1 },
      { depth: 2 },
      { depth: 3 },
    ];

function report(name: string, results: Array<{ landed: boolean; fuel: number; impact: number; time: number; reason: string }>, extra = '') {
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const landed = results.filter((r) => r.landed);
  console.log(
    `${name.padEnd(26)} landed=${((landed.length / results.length) * 100).toFixed(0)}% ` +
      `fuel=${mean(results.map((r) => r.fuel)).toFixed(2)} impact=${mean(results.map((r) => r.impact)).toFixed(2)} ` +
      `time=${mean(results.map((r) => r.time)).toFixed(1)}s ${extra} ${JSON.stringify(reasons)}`,
  );
}

for (const level of levels) {
  const teacher = new LanderTeacher(level);
  let decisions = 0;
  let cost = 0;
  const t0 = performance.now();
  const results = seeds.map((seed) => {
    const env = new LanderEnv();
    env.reset(seed);
    while (!env.isDone()) {
      const r = teacher.score(env);
      decisions++;
      cost += r.cost;
      env.step(argmax(r.scores));
    }
    const m = env.summary().metrics;
    return { landed: m.landed === 1, fuel: m.fuelUsed, impact: m.impactSpeed, time: m.flightTime, reason: env.summary().endReason };
  });
  const us = ((performance.now() - t0) * 1000) / decisions;
  report(teacher.name, results, `cost/dec=${(cost / decisions).toFixed(0)} us/dec=${us.toFixed(0)}`);
}

report(
  'autopilot alone',
  seeds.map((seed) => {
    const env = new LanderEnv();
    env.reset(seed);
    while (!env.isDone()) env.step(pilotAction(env.state, env.world, env.config));
    const m = env.summary().metrics;
    return { landed: m.landed === 1, fuel: m.fuelUsed, impact: m.impactSpeed, time: m.flightTime, reason: env.summary().endReason };
  }),
);

const random = new RandomPlayer(1);
report(
  'random',
  seeds.map((seed) => {
    const env = new LanderEnv();
    env.reset(seed);
    while (!env.isDone()) env.step(random.act(env).action);
    const m = env.summary().metrics;
    return { landed: m.landed === 1, fuel: m.fuelUsed, impact: m.impactSpeed, time: m.flightTime, reason: env.summary().endReason };
  }),
);
