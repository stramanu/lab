import type { Env, MoveRecord, Teacher } from '../src/core/types';
import { RacingEnv } from '../src/games/racing/env';
import { argmax } from '../src/core/types';
import type { GameDefinition } from '../src/games/registry';
import { $ } from './dom';
import type { BoardView } from './game-view';
import { RacingView } from './racing-view';
import { Telemetry, drawTelemetry } from './telemetry';

/** Racing only: the planner ghost, the telemetry strip, and the camera and trail modes. */
export class RacingExtras {
  private readonly telemetry = new Telemetry(200);
  private readonly canvas = $<HTMLCanvasElement>('telemetry');
  private ghostEnv: RacingEnv | null = null;
  private ghostTeacher: Teacher | null = null;
  private ghostOn = true;
  private camera: 'chase' | 'track' = 'chase';
  private trail: 'decider' | 'speed' = 'decider';
  private view: BoardView | null = null;
  private def: GameDefinition | null = null;

  /** `onGhostToggled` restarts the episode, so the ghost starts level with the live car. */
  constructor(onGhostToggled: () => void) {
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-camera]')) {
      b.addEventListener('click', () => {
        this.camera = b.dataset.camera as 'chase' | 'track';
        for (const o of document.querySelectorAll<HTMLButtonElement>('[data-camera]')) o.setAttribute('aria-pressed', String(o === b));
        if (this.view instanceof RacingView) this.view.camera = this.camera;
      });
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-trail]')) {
      b.addEventListener('click', () => {
        this.trail = b.dataset.trail as 'decider' | 'speed';
        for (const o of document.querySelectorAll<HTMLButtonElement>('[data-trail]')) o.setAttribute('aria-pressed', String(o === b));
        if (this.view instanceof RacingView) this.view.trailMode = this.trail;
      });
    }
    $<HTMLInputElement>('ghost').addEventListener('change', (e) => {
      this.ghostOn = (e.target as HTMLInputElement).checked;
      if (this.view && this.def) this.configure(this.view, this.def);
      onGhostToggled();
    });
  }

  /** Shows the racing controls for the racing view and (re)creates the ghost. */
  configure(view: BoardView, def: GameDefinition): void {
    this.view = view;
    this.def = def;
    const racing = view instanceof RacingView;
    $('racing-controls').hidden = !racing;
    $('telemetry-block').hidden = !racing;
    this.ghostEnv = racing && this.ghostOn ? new RacingEnv() : null;
    this.ghostTeacher = this.ghostEnv ? def.makeTeacher(def.referenceLevel) : null;
    if (view instanceof RacingView) {
      view.camera = this.camera;
      view.trailMode = this.trail;
      view.ghost = this.ghostEnv;
    }
  }

  reset(episodeSeed: number): void {
    this.ghostEnv?.reset(episodeSeed);
    this.telemetry.clear();
  }

  /** After each live move: the ghost plays the planner's move (display only, not counted), telemetry records. */
  afterMove(env: Env, move: MoveRecord): void {
    if (this.ghostEnv && this.ghostTeacher && !this.ghostEnv.isDone()) this.ghostEnv.step(argmax(this.ghostTeacher.score(this.ghostEnv).scores));
    if (env instanceof RacingEnv) {
      this.telemetry.push({ speed: env.car.speed, steer: env.car.steer, pedal: move.continuous ? move.continuous[1] : move.action % 2 === 0 ? 1 : -1, escalated: move.decider === 'system2' });
    }
  }

  draw(): void {
    if (this.view instanceof RacingView) drawTelemetry(this.canvas, this.telemetry);
  }
}
