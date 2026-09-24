import type { ContinuousEnv, Env } from '../src/core/types';
import { $ } from './dom';
import { EXPLAINERS } from './explainers';
import type { DemoGame } from './games';

/** Hidden layer sizes of the game's published network (its training configuration). */
export function hiddenOf(game: DemoGame): [number, number] {
  return game.def.continuous?.pipeline.hidden ?? game.def.pipeline.hidden ?? [64, 64];
}

/** Fills the "This game" panel: task, network (with its real sizes), inputs, outputs, planner, guard, result. */
export function renderExplainer(game: DemoGame, env: Env): void {
  const e = EXPLAINERS[game.def.name];
  if (!e) return;
  $('about-title').textContent = `This game: ${game.def.title}`;
  $('about-what').textContent = e.what;
  $('about-outputs').textContent = e.outputs;
  $('about-planner').textContent = e.planner;
  $('about-guard').textContent = e.guard;
  $('about-result').textContent = e.result;
  const inputs = env.encodingSize;
  const outputs = game.def.continuous ? (env as ContinuousEnv).actionDim : env.numActions;
  const [h1, h2] = hiddenOf(game);
  const params = inputs * h1 + h1 + h1 * h2 + h2 + h2 * outputs + outputs;
  $('about-network').textContent = game.def.continuous
    ? `An ensemble of 5 networks, each ${inputs} inputs → ${h1} → ${h2} ReLU units → ${outputs} outputs (${params.toLocaleString('en')} parameters each, ${(5 * params).toLocaleString('en')} in total).`
    : `${inputs} inputs → ${h1} → ${h2} ReLU units → ${outputs} outputs: ${params.toLocaleString('en')} parameters, written and trained from scratch.`;
  $('about-inputs-count').textContent = `${inputs} values`;
  $('about-inputs').replaceChildren(
    ...e.inputs.map((g) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="n"></td><td><b></b><span></span></td>';
      tr.querySelector('.n')!.textContent = String(g.count);
      tr.querySelector('b')!.textContent = g.name;
      tr.querySelector('span')!.textContent = g.detail;
      return tr;
    }),
  );
}

/** One line under the 3D view: how its input layer is laid out, the hidden layers and the outputs. */
export function networkLegend(game: DemoGame, env: Env): string {
  const [h1, h2] = hiddenOf(game);
  if (game.input.kind === 'window') {
    return game.def.name === 'warehouse'
      ? `Inputs: the 9×9 window around the deciding robot (shelves, other robots, its goal), then goal direction, distance-map hints for the four neighbours, local density and time. Hidden layers: ${h1} + ${h2} ReLU units. Outputs: wait, north, east, south, west.`
      : `Inputs: the 7×7 window around the head (colored by what each cell holds), then food direction and length. Hidden layers: ${h1} + ${h2} ReLU units. Outputs: straight, left, right.`;
  }
  return game.def.continuous
    ? `Inputs, top to bottom: ${game.input.labels.join(', ')}. Hidden layers: ${h1} + ${h2} ReLU units. Outputs: ${game.def.continuous.actionLabels.join(', ')}. Shown: member 1 of the 5-network ensemble; the robot or car follows the ensemble mean.`
    : `Inputs, top to bottom: ${game.input.labels.join(', ')}. Hidden layers: ${h1} + ${h2} ReLU units. Outputs: ${env.actionNames.join(', ')}.`;
}
