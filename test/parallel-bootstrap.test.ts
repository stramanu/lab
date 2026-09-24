import { describe, expect, it } from 'vitest';
import { RacingEnv, RacingGuard, RacingTeacher, racingAgrees } from '../src/games/racing';
import { ContinuousPipeline, plannerEpisode } from '../src/training';

describe('bootstrap from pre-generated planner episodes', () => {
  it('trains exactly the same ensemble as the sequential bootstrap', () => {
    const spec = { name: 'racing', makeEnv: () => new RacingEnv(), teacher: new RacingTeacher({ horizon: 10 }), guard: new RacingGuard(), agrees: racingAgrees };
    const config = { bootstrapEpisodes: 2, bootstrapEpochs: 2, iterations: 1, maxMovesPerIteration: 300, retrainEvery: 200, consolidationEpochs: 1, hidden: [16, 16] as [number, number] };
    const sequential = new ContinuousPipeline(spec, config).run();
    const replay = new ContinuousPipeline(spec, config);
    const episodes = replay.bootstrapSeeds().map((seed) => plannerEpisode(spec.makeEnv, spec.teacher, seed));
    const parallel = replay.run({}, episodes);
    expect(JSON.stringify(parallel.members)).toBe(JSON.stringify(sequential.members));
    expect(parallel.confidenceMap).toEqual(sequential.confidenceMap);
  }, 120_000);
});
