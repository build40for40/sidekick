// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicalInput, readControls, stickAxes, type GamepadState } from '../src/controller/gamepad';

function pad(index = 0, id = 'Test controller', mapping = 'standard'): Gamepad {
  return { index, id, mapping, connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] } as unknown as Gamepad;
}
let pads: (Gamepad | null)[], frames: Map<number, FrameRequestCallback>, nextFrame: number;
let hidden: ReturnType<typeof vi.spyOn>, physical: PhysicalInput;
let presses: ReturnType<typeof vi.fn<(id: string) => void>>, reports: ReturnType<typeof vi.fn<(message: string) => void>>, snapshots: GamepadState[];
function tick() {
  const pending = [...frames.entries()];
  for (const [id, callback] of pending) { frames.delete(id); callback(0); }
}
function button(p: Gamepad, index: number, pressed: boolean, value = pressed ? 1 : 0) {
  (p.buttons as GamepadButton[])[index] = { pressed, value, touched: pressed };
}
beforeEach(() => {
  pads = []; frames = new Map(); nextFrame = 0; snapshots = [];
  presses = vi.fn(); reports = vi.fn();
  hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('navigator', { getGamepads: vi.fn(() => pads) });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  physical = new PhysicalInput(presses, reports, snapshot => snapshots.push(snapshot));
});
afterEach(() => { physical.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const latest = () => snapshots.at(-1)!;

describe('live gamepad input', () => {
  it('renders held inputs at connection but confirms only subsequent press edges, including simultaneous presses', () => {
    const p = pad(); button(p, 0, true); pads = [null, p]; physical.start();
    expect(latest().controls.find(c => c.controlId === 'cross')?.pressed).toBe(true);
    expect(presses).not.toHaveBeenCalled();
    tick(); expect(snapshots).toHaveLength(1);
    button(p, 0, false); tick();
    expect(latest().controls.find(c => c.controlId === 'cross')?.pressed).toBe(false);
    button(p, 0, true); button(p, 5, true); tick(); tick();
    expect(presses.mock.calls).toEqual([['cross'], ['r1']]);
    expect(reports).toHaveBeenCalledOnce();
  });
  it('reads partial triggers and two sticks independently of stick clicks, rejecting unknown mappings', () => {
    const p = pad(); button(p, 6, false, .42); button(p, 10, true); (p.axes as number[]) = [.6, -.8, -.8, .6];
    const inputs = readControls(p);
    expect(inputs.find(c => c.controlId === 'l2')).toMatchObject({ value: .42, pressed: false });
    expect(inputs.find(c => c.controlId === 'left-stick')).toMatchObject({ pressed: true, axes: [.6, -.8] });
    expect(inputs.find(c => c.controlId === 'right-stick')?.axes).toEqual([-.8, .6]);
    expect(stickAxes(.02, -.04)).toEqual([0, 0]);
    expect(stickAxes(NaN, Infinity)).toEqual([0, 0]);
    expect(Math.hypot(...stickAxes(1, 1))).toBeCloseTo(1);
    expect(readControls(pad(0, 'Unknown', ''))).toEqual([]);
  });
  it('keeps a stable supported device and resets the press baseline on handover and reconnect', () => {
    const first = pad(2), second = pad(5, 'Second');
    button(first, 0, true); button(second, 1, true);
    pads = [pad(0, 'Unknown', ''), first]; physical.start();
    pads = [second, first]; tick(); expect(latest().controller?.index).toBe(2);
    pads = [second]; tick(); expect(latest().controller?.index).toBe(5); expect(presses).not.toHaveBeenCalled();
    const disconnected = new Event('gamepaddisconnected'); Object.defineProperty(disconnected, 'gamepad', { value: second });
    window.dispatchEvent(disconnected); expect(latest().controls).toEqual([]);
    tick(); expect(presses).not.toHaveBeenCalled();
    pads = []; tick(); expect(latest()).toEqual({ status: 'waiting', controller: null, controls: [] });
    pads = [second]; tick(); expect(presses).not.toHaveBeenCalled();
  });
  it('clears on hide and disable, resumes with a baseline, and does not duplicate or leak polling', () => {
    const p = pad(); pads = [p]; physical.start(); physical.start(); expect(frames.size).toBe(1);
    button(p, 0, true); tick(); expect(presses).toHaveBeenCalledOnce();
    hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
    expect(latest().status).toBe('suspended'); expect(latest().controls).toEqual([]); expect(frames.size).toBe(0);
    hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    expect(latest().status).toBe('connected'); expect(presses).toHaveBeenCalledOnce(); expect(frames.size).toBe(1);
    physical.stop(); expect(latest().status).toBe('disabled'); expect(frames.size).toBe(0);
    document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
    physical.start(); expect(frames.size).toBe(1); expect(presses).toHaveBeenCalledOnce();
  });
  it('fails closed for unsupported devices, missing APIs and policy errors, and recovers', () => {
    pads = [pad(0, 'Unknown', '')]; physical.start(); expect(latest().status).toBe('unsupported');
    expect(latest().controls).toEqual([]); expect(presses).not.toHaveBeenCalled();
    vi.mocked(navigator.getGamepads).mockImplementationOnce(() => { throw new DOMException('Blocked', 'SecurityError'); });
    tick(); expect(latest().status).toBe('unavailable');
    pads = [pad()]; tick(); expect(latest().status).toBe('connected');
    vi.stubGlobal('navigator', {}); tick(); expect(latest().status).toBe('unavailable');
  });
  it('can be stopped by a state listener without leaving a frame scheduled or emitting a stale connection report', () => {
    physical = new PhysicalInput(presses, reports, state => { if (state.status === 'connected') physical.stop(); });
    pads = [pad()]; physical.start(); expect(frames.size).toBe(0); expect(reports).not.toHaveBeenCalled();
  });
});
