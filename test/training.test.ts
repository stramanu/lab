import { describe, expect, it } from 'vitest';
import { SnakeEnv, SnakeTeacher } from '../src/games/snake';
import { TeacherPlayer } from '../src/hybrid';
import { importPolicy } from '../src/nn';
import { ReplayDataset, TrainingPipeline, type PipelineConfig } from '../src/training';

const vec = (...v: number[]) => Float32Array.from(v);

describe('ReplayDataset', () => {
  it('rejects duplicate encodings', () => {
    const d = new ReplayDataset(10, 3, 2);
    expect(d.add(vec(1, 0, 0), [1, 0], [1, 1])).toBe(true);
    expect(d.add(vec(1, 0, 0), [0, 1], [1, 1])).toBe(false);
    expect(d.size).toBe(1);
  });

  it('keeps distinct states whose values lie outside [0, 1] or differ below 1/255', () => {
    const d = new ReplayDataset(10, 2, 2);
    expect(d.add(vec(-0.5, 2), [1, 0], [1, 1])).toBe(true);
    expect(d.add(vec(-0.2, 3), [1, 0], [1, 1])).toBe(true); // both clamp to (0, 1) under a clamped hash
    expect(d.add(vec(0.5, 0), [1, 0], [1, 1])).toBe(true);
    expect(d.add(vec(0.501, 0), [1, 0], [1, 1])).toBe(true); // same 1/255 bucket, different state
    expect(d.add(vec(-0.2, 3), [0, 1], [1, 1])).toBe(false); // exact duplicate
    expect(d.size).toBe(4);
  });

  it('replaces the oldest examples when full and forgets their hashes', () => {
    const d = new ReplayDataset(3, 2, 2);
    for (let i = 0; i < 3; i++) d.add(vec(i / 10, 0), [1, 0], [1, 1]);
    expect(d.size).toBe(3);
    d.add(vec(0.9, 0), [0, 1], [1, 0]);
    expect(d.size).toBe(3);
    expect(d.has(vec(0, 0))).toBe(false); // oldest evicted
    expect(d.has(vec(0.9, 0))).toBe(true);
    expect(Array.from(d.x(0))).toEqual([Math.fround(0.9), 0]);
    expect(Array.from(d.legal(0))).toEqual([1, 0]);
    expect(d.add(vec(0, 0), [1, 0], [1, 1])).toBe(true); // evicted state can come back
  });
});

const tiny: Partial<PipelineConfig> = {
  seed: 3,
  maxEpisodeSteps: 300,
  bootstrapEpisodes: 2,
  bootstrapEpochs: 1,
  datasetCapacity: 20_000,
  validationCapacity: 5_000,
  hidden: [16, 16],
  retrainEvery: 150,
  retrainEpochs: 1,
  iterations: 2,
  consolidationEpochs: 1,
  auditRate: 0.2,
};

function game() {
  return { name: 'snake', makeEnv: () => new SnakeEnv(), teacher: new SnakeTeacher({ depth: 0 }) };
}

describe('TrainingPipeline', () => {
  it('bootstrap labels every state played by the teacher, net of duplicates', () => {
    const p = new TrainingPipeline(game(), tiny);
    const entry = p.bootstrap();
    expect(entry.phase).toBe('bootstrap');
    expect(entry.escalationRate).toBe(1);
    expect(p.dataset.size + p.validation.size).toBeGreaterThan(0);
    expect(p.dataset.size + p.validation.size).toBeLessThanOrEqual(entry.moves);
    // Replay the same teacher episodes: every visited state must be labeled somewhere.
    const player = new TeacherPlayer(game().teacher);
    for (const seed of p.trainingSeeds()) {
      const env = new SnakeEnv();
      env.reset(seed);
      for (let t = 0; t < 300 && !env.isDone(); t++) {
        const x = env.encode();
        expect(p.dataset.has(x) || p.validation.has(x)).toBe(true);
        env.step(player.act(env).action);
      }
    }
  });

  it('escalation iterations log the escalation rate and label audited states', () => {
    const logs: number[] = [];
    const p = new TrainingPipeline(game(), tiny, (e) => logs.push(e.escalationRate));
    p.bootstrap();
    const sizeBefore = p.dataset.size;
    const e1 = p.escalationIteration();
    const e2 = p.escalationIteration();
    for (const e of [e1, e2]) {
      expect(e.phase).toBe('escalation');
      expect(e.escalationRate).toBeGreaterThanOrEqual(0);
      expect(e.escalationRate).toBeLessThanOrEqual(1);
      expect(e.moves).toBeGreaterThan(0);
    }
    expect(logs).toHaveLength(3);
    expect(p.dataset.size).toBeGreaterThan(sizeBefore);
  });

  it('audit labels confident states even when nothing escalates', () => {
    const p = new TrainingPipeline(game(), { ...tiny, threshold: 0, auditRate: 1, retrainEvery: 100 });
    p.bootstrap();
    const before = p.dataset.size + p.validation.size;
    const e = p.escalationIteration();
    expect(e.escalationRate).toBe(0);
    expect(e.auditAgreement).not.toBeNull();
    expect(p.dataset.size + p.validation.size).toBeGreaterThan(before);
  });

  it('consolidation exports reloadable weights that include the temperature', () => {
    const p = new TrainingPipeline(game(), tiny);
    const policy = JSON.parse(JSON.stringify(p.run()));
    const { net, calibrationT, meta } = importPolicy(policy);
    expect(calibrationT).toBeGreaterThan(0);
    expect(calibrationT).toBe(p.student.temperature);
    expect(net.numParams).toBe(p.net.numParams);
    expect(meta?.game).toBe('snake');
    expect(p.log.map((e) => e.phase)).toEqual(['bootstrap', 'escalation', 'escalation', 'consolidation']);
  });

  it('is reproducible: same config, same weights byte for byte', () => {
    const a = new TrainingPipeline(game(), tiny).run();
    const b = new TrainingPipeline(game(), tiny).run();
    expect(a.weights).toBe(b.weights);
    expect(a.calibrationT).toBe(b.calibrationT);
  });
});

describe('TrainingPipeline with guard', () => {
  it('labels guard-rejected states and logs the guard share', () => {
    let calls = 0;
    const rejectAll = { name: 'reject-all', check: () => (calls++, { ok: false, cost: 1 }) };
    const p = new TrainingPipeline(
      { ...game(), guard: rejectAll },
      { ...tiny, threshold: 0, auditRate: 0, retrainEvery: 100 },
    );
    p.bootstrap();
    const before = p.dataset.size + p.validation.size;
    const e = p.escalationIteration();
    // Threshold 0: every escalation comes from the guard, and every escalated state is labeled.
    expect(calls).toBeGreaterThan(0);
    expect(e.escalationRate).toBe(1);
    expect(e.guardEscalationRate).toBe(1);
    expect(p.dataset.size + p.validation.size).toBeGreaterThan(before);
  });

  it('ignores the guard when useGuard is false', () => {
    let calls = 0;
    const g = { name: 'count', check: () => (calls++, { ok: true, cost: 1 }) };
    const p = new TrainingPipeline({ ...game(), guard: g }, { ...tiny, useGuard: false });
    p.bootstrap();
    const e = p.escalationIteration();
    expect(calls).toBe(0);
    expect(e.guardEscalationRate).toBe(0);
  });
});
