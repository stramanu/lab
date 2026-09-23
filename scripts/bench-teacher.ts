/** Measures Snake teacher quality and time per decision at several lookahead depths. */
import { RandomPlayer } from '../src/core/players';
import { mean } from '../src/core/stats';
import { argmax } from '../src/core/types';
import { SnakeEnv, SnakeTeacher } from '../src/games/snake';

const episodes = Number(process.argv[2] ?? 20);
const seeds = Array.from({ length: episodes }, (_, i) => 9000 + i);

for (const depth of [0, 1, 2]) {
  const teacher = new SnakeTeacher({ depth });
  const scores: number[] = [];
  const reasons: Record<string, number> = {};
  let moves = 0;
  let cost = 0;
  const t0 = performance.now();
  for (const seed of seeds) {
    const env = new SnakeEnv();
    env.reset(seed);
    while (!env.isDone()) {
      const r = teacher.score(env);
      cost += r.cost;
      moves++;
      env.step(argmax(r.scores));
    }
    scores.push(env.score());
    const reason = env.summary().endReason;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const ms = performance.now() - t0;
  console.log(
    `depth=${depth} meanScore=${mean(scores).toFixed(1)} min=${Math.min(...scores)} max=${Math.max(...scores)} ` +
      `us/move=${((ms * 1000) / moves).toFixed(1)} cost/move=${(cost / moves).toFixed(0)} moves=${moves} reasons=${JSON.stringify(reasons)}`,
  );
}

const random = new RandomPlayer(1);
const randomScores = seeds.map((seed) => {
  const env = new SnakeEnv();
  env.reset(seed);
  while (!env.isDone()) env.step(random.act(env).action);
  return env.score();
});
console.log(`random meanScore=${mean(randomScores).toFixed(2)}`);
