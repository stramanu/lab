const CANDIDATES = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];

export function supportedVideoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Records a canvas to a downloadable video file. */
export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  readonly mimeType: string | null = supportedVideoType();

  constructor(private readonly canvas: HTMLCanvasElement) {}

  get available(): boolean {
    return this.mimeType !== null && typeof this.canvas.captureStream === 'function';
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  start(): void {
    if (!this.available || this.recording) return;
    this.chunks = [];
    const stream = this.canvas.captureStream(30);
    this.recorder = new MediaRecorder(stream, { mimeType: this.mimeType!, videoBitsPerSecond: 4_000_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
  }

  /** Stops and resolves with the video blob and a suggested file name. */
  stop(): Promise<{ blob: Blob; filename: string }> {
    return new Promise((resolve, reject) => {
      const r = this.recorder;
      if (!r) return reject(new Error('Not recording'));
      r.onstop = () => {
        const ext = this.mimeType!.startsWith('video/mp4') ? 'mp4' : 'webm';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        resolve({ blob: new Blob(this.chunks, { type: this.mimeType! }), filename: `system-one-snake-${stamp}.${ext}` });
        r.stream.getTracks().forEach((t) => t.stop());
        this.recorder = null;
      };
      r.stop();
    });
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
