import { afterEach, expect, it, vi } from 'vitest';
import { DemonstrationPlayer, playbackOptions } from '../src/tutor/playback';
import type { TutorStep } from '../src/tutor/schema';
const steps: TutorStep[] = [{ action: 'press', controlId: 'cross', say: 'Put it down.' },{ action: 'press', controlId: 'square', say: 'Chop it.' }];
afterEach(() => vi.useRealTimers());
it('defaults to medium and unlimited, loops in order and cancels without further work', () => {
  vi.useFakeTimers(); const show = vi.fn(), clear = vi.fn();
  expect(playbackOptions()).toEqual({ speed:'medium',maxRepeats:null });
  const player = new DemonstrationPlayer(show,clear);
  player.start(steps); vi.advanceTimersByTime(2150*4);
  expect(show.mock.calls.map(([step]) => step.controlId)).toEqual(['cross','square','cross','square','cross']);
  player.stop(); vi.advanceTimersByTime(20000); expect(show).toHaveBeenCalledTimes(5);
  expect(vi.getTimerCount()).toBe(0);
});
it('counts narrated passes, applies speed and respects a finite total', () => {
  vi.useFakeTimers(); const show = vi.fn(); const player = new DemonstrationPlayer(show,vi.fn(),{ speed:'fast',maxRepeats:2 });
  player.start(steps,1); vi.advanceTimersByTime(4000);
  expect(show).toHaveBeenCalledTimes(2); expect(show.mock.calls[0][1]).toBe(1100); expect(vi.getTimerCount()).toBe(0);
  player.start(steps,2); expect(show).toHaveBeenCalledTimes(2);
});
it('synchronizes spoken steps without starting a second loop and rejects invalid settings', () => {
  vi.useFakeTimers(); const show = vi.fn(); const player = new DemonstrationPlayer(show,vi.fn());
  player.start(steps); player.showSpokenStep(steps[1],3200); vi.advanceTimersByTime(10000);
  expect(show).toHaveBeenLastCalledWith(steps[1],3200); expect(show).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  for (const maxRepeats of [0,-1,1.5,Infinity]) expect(() => player.configure({ maxRepeats })).toThrow();
  expect(() => player.configure({ speed:'bogus' as any })).toThrow();
});
