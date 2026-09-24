import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnakeEnv, SnakeGuard, SnakeTeacher } from '../src/games/snake';
import { importEnsemble, importPolicy } from '../src/nn';
import { TrainingPipeline, runSession, type PipelineConfig } from '../src/training';

const tiny: Partial<PipelineConfig> = {
  seed: 5,
  maxEpisodeSteps: 200,
  bootstrapEpisodes: 2,
  bootstrapEpochs: 1,
  datasetCapacity: 10_000,
  validationCapacity: 2_000,
  hidden: [8, 8],
  retrainEvery: 100,
  retrainEpochs: 1,
  iterations: 3,
  consolidationEpochs: 1,
};
const game = () => ({ name: 'snake', makeEnv: () => new SnakeEnv(), teacher: new SnakeTeacher({ depth: 0 }), guard: new SnakeGuard() });
const noYield = () => Promise.resolve();

describe('runSession', () => {
  it('produces the same weights as pipeline.run()', async () => {
    const offline = new TrainingPipeline(game(), tiny).run();
    const steps: string[] = [];
    const result = await runSession(new TrainingPipeline(game(), tiny), {
      shouldStop: () => false,
      onStep: (e, policy) => {
        steps.push(e.phase);
        expect(importPolicy(policy).net.numParams).toBeGreaterThan(0);
      },
      yieldControl: noYield,
    });
    expect(result.completed).toBe(true);
    expect(result.policy.weights).toBe(offline.weights);
    expect(result.policy.calibrationT).toBe(offline.calibrationT);
    expect(steps).toEqual(['bootstrap', 'escalation', 'escalation', 'escalation', 'consolidation']);
  });

  it('stops after the current escalation iteration', async () => {
    const steps: string[] = [];
    let stop = false;
    const result = await runSession(new TrainingPipeline(game(), tiny), {
      shouldStop: () => stop,
      onStep: (e) => {
        steps.push(e.phase);
        if (e.phase === 'escalation') stop = true; // request stop during the first iteration
      },
      yieldControl: noYield,
    });
    expect(result.completed).toBe(false);
    expect(steps).toEqual(['bootstrap', 'escalation']);
    expect(importPolicy(result.policy).calibrationT).toBeGreaterThan(0);
  });
});

describe('demo data', () => {
  const dir = join(__dirname, '..', 'web', 'public', 'data');
  it('ships a loadable pretrained racing ensemble (study run 1)', () => {
    const e = importEnsemble(JSON.parse(readFileSync(join(dir, 'racing-weights.json'), 'utf8')));
    expect(e.members).toHaveLength(5);
    expect(e.decide(new Float32Array(20)).action).toHaveLength(2);
  });
  for (const [game, params] of [['snake', 17_283], ['lander', 5_508]] as const) {
    it(`ships loadable pretrained ${game} weights (study run 1)`, () => {
      const { net } = importPolicy(JSON.parse(readFileSync(join(dir, `${game}-weights.json`), 'utf8')));
      expect(net.numParams).toBe(params);
    });
  }
});
