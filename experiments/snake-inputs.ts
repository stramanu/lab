/**
 * Claim: giving System One a richer view of the board barely helps it on its own.
 * Trains the same pipeline with four encodings (7×7 baseline, 11×11, 7×7 + body age, tail
 * direction and obstacle rays, 11×11 + all) and evaluates System One alone and the
 * unguarded hybrid on dev seeds. The variant encodings live here, not in the library.
 */
import { seedsFor, runCondition } from '../src/eval';
import { DX, DY, SnakeEnv, SnakeTeacher } from '../src/games/snake';
import { HybridPlayer, NetStudent, StudentPlayer } from '../src/hybrid';
import { importPolicy } from '../src/nn';
import { TrainingPipeline } from '../src/training';
import type { ExperimentResult } from './common';

interface Variant {
  window: number;
  extras: boolean;
}

const VARIANTS: Record<string, Variant> = {
  'window7': { window: 7, extras: false },
  'window11': { window: 11, extras: false },
  'window7+extras': { window: 7, extras: true },
  'window11+extras': { window: 11, extras: true },
};

const size = (v: Variant) => v.window * v.window * (v.extras ? 5 : 4) + 5 + (v.extras ? 5 + 8 : 0);

/** Egocentric window with optional body-age channel, tail direction and 8 obstacle rays. */
class VariantEnv extends SnakeEnv {
  override readonly encodingSize: number;
  constructor(readonly variant: Variant) {
    super();
    this.encodingSize = size(variant);
  }
  override encode(out?: Float32Array): Float32Array {
    const { window, extras } = this.variant;
    const v = out ?? new Float32Array(this.encodingSize);
    v.fill(0);
    const ch = extras ? 5 : 4;
    const half = window >> 1;
    const h = this.head();
    const hx = this.x(h);
    const hy = this.y(h);
    const fx = DX[this.heading];
    const fy = DY[this.heading];
    const r = (this.heading + 1) & 3;
    const rx = DX[r];
    const ry = DY[r];
    const freeIn = new Map<number, number>();
    this.body().forEach((c, i) => freeIn.set(c, i + 1));
    for (let i = 0; i < window; i++) {
      for (let j = 0; j < window; j++) {
        const x = hx + fx * (half - i) + rx * (j - half);
        const y = hy + fy * (half - i) + ry * (j - half);
        const base = (i * window + j) * ch;
        if (!this.inBounds(x, y)) {
          v[base + 2] = 1;
          continue;
        }
        const c = this.index(x, y);
        if (this.occ[c]) {
          v[base + 1] = 1;
          if (extras) v[base + 4] = Math.min(freeIn.get(c)!, 50) / 50;
        } else if (c === this.food) v[base + 3] = 1;
        else v[base] = 1;
      }
    }
    let k = window * window * ch;
    const norm = this.width + this.height;
    const rel = (tx: number, ty: number) => {
      const dx = tx - hx;
      const dy = ty - hy;
      const along = dx * fx + dy * fy;
      const lateral = dx * rx + dy * ry;
      v[k++] = Math.max(along, 0) / norm;
      v[k++] = Math.max(-along, 0) / norm;
      v[k++] = Math.max(-lateral, 0) / norm;
      v[k++] = Math.max(lateral, 0) / norm;
    };
    if (this.food >= 0) rel(this.x(this.food), this.y(this.food));
    else k += 4;
    v[k++] = this.length / this.cells;
    if (extras) {
      const t = this.tail();
      rel(this.x(t), this.y(t));
      v[k++] = this.length / this.cells;
      const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      for (const [a, b] of dirs) {
        const sx = fx * a + rx * b;
        const sy = fy * a + ry * b;
        let n = 1;
        let x = hx + sx;
        let y = hy + sy;
        while (this.inBounds(x, y) && !this.occ[this.index(x, y)]) {
          n++;
          x += sx;
          y += sy;
        }
        v[k++] = n / 20;
      }
    }
    return v;
  }
}

export function run(): ExperimentResult {
  const seeds = seedsFor('dev', 30);
  const iterations = 15;
  const results: Record<string, unknown> = {};
  for (const [name, variant] of Object.entries(VARIANTS)) {
    console.log(`Training ${name}…`);
    const teacher = new SnakeTeacher({ depth: 1 });
    const pipeline = new TrainingPipeline({ name: 'snake', makeEnv: () => new VariantEnv(variant), teacher }, { iterations, seed: 1 });
    const { net, calibrationT } = importPolicy(pipeline.run());
    const eval1 = (label: string, makePlayer: () => StudentPlayer | HybridPlayer) =>
      runCondition({ name: label, kind: 'hybrid', params: {}, makePlayer }, { makeEnv: () => new VariantEnv(variant), seeds });
    const alone = eval1('system1', () => new StudentPlayer(new NetStudent(net, calibrationT)));
    const hybrid = eval1('hybrid@0.9', () => new HybridPlayer(new NetStudent(net, calibrationT), new SnakeTeacher({ depth: 1 }), { threshold: 0.9 }));
    results[name] = {
      inputs: size(variant),
      params: net.numParams,
      system1Score: alone.score.mean,
      hybrid09Score: hybrid.score.mean,
      hybrid09Escalation: hybrid.escalationRate,
    };
  }
  return {
    claim: 'Richer inputs (11×11 window, body age, tail direction, obstacle rays) change System One alone only marginally.',
    split: 'dev',
    seeds,
    config: { iterations, pipelineSeed: 1, teacherDepth: 1, guard: false },
    results,
  };
}
