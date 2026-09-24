/** Lap timing from forward progress along a closed track (pure, testable). */
export class LapTimer {
  lapStart = 0;
  laps = 0;
  last: number | null = null;
  best: number | null = null;

  reset(): void {
    this.lapStart = 0;
    this.laps = 0;
    this.last = null;
    this.best = null;
  }

  /** Call after every step with the car's progress (m), time (s) and the track length (m). */
  update(progress: number, time: number, trackLength: number): void {
    const completed = Math.floor(Math.max(0, progress) / trackLength);
    while (this.laps < completed) {
      this.laps++;
      // Interpolate the crossing time only to the step resolution: use the current time.
      this.last = time - this.lapStart;
      this.best = this.best === null ? this.last : Math.min(this.best, this.last);
      this.lapStart = time;
    }
  }

  current(time: number): number {
    return time - this.lapStart;
  }
}
