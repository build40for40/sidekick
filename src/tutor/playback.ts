import type { TutorStep } from './schema';
export type PlaybackSpeed = 'slow' | 'medium' | 'fast';
export interface PlaybackOptions { speed?: PlaybackSpeed; /** Total visual passes; null means unlimited. */ maxRepeats?: number | null }
export const stepDuration = { slow: 2600, medium: 1800, fast: 1100 } as const;
export function playbackOptions(options: PlaybackOptions = {}): Required<PlaybackOptions> {
  const speed = options.speed ?? 'medium';
  const maxRepeats = options.maxRepeats === undefined ? null : options.maxRepeats;
  if (typeof speed !== 'string' || !Object.hasOwn(stepDuration,speed) || (maxRepeats !== null && (!Number.isSafeInteger(maxRepeats) || maxRepeats < 1))) throw Error('Invalid demonstration playback settings.');
  return { speed, maxRepeats };
}
/** Visual loops are independent of speech/model inference and own a single cancellable timer. */
export class DemonstrationPlayer {
  private timer?: ReturnType<typeof setTimeout>;
  private settings: Required<PlaybackOptions>;
  constructor(private show: (step: TutorStep, durationMs: number) => void, private clear: () => void, options: PlaybackOptions = {}) { this.settings = playbackOptions(options); }
  configure(options: PlaybackOptions) { const settings = playbackOptions({ ...this.settings,...options }); this.stop(); this.settings = settings; }
  stop() { clearTimeout(this.timer); this.timer = undefined; this.clear(); }
  showSpokenStep(step: TutorStep, durationMs: number) { this.stop(); this.show(step,durationMs); }
  start(steps: TutorStep[], completedPasses = 0) {
    this.stop();
    if (!steps.length || (this.settings.maxRepeats !== null && completedPasses >= this.settings.maxRepeats)) return;
    let index = 0, passes = completedPasses;
    const next = () => {
      const duration = stepDuration[this.settings.speed];
      this.show(steps[index],duration);
      this.timer = setTimeout(() => {
        index++;
        if (index === steps.length) {
          index = 0; passes++;
          if (this.settings.maxRepeats !== null && passes >= this.settings.maxRepeats) { this.stop(); return; }
        }
        next();
      },duration + 350);
    };
    next();
  }
}
