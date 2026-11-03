import { controls } from './manifest';

export interface ControlInput {
  controlId: string;
  pressed: boolean;
  /** Button/trigger travel, from 0 to 1. */
  value: number;
  /** Stick axes after a radial dead zone; right/down are positive. */
  axes?: [number, number];
}
export interface GamepadState {
  status: 'disabled' | 'waiting' | 'connected' | 'unsupported' | 'unavailable' | 'suspended';
  controller: { index: number; id: string; mapping: string } | null;
  controls: ControlInput[];
}
export const inputActive = (input: ControlInput) => input.pressed || input.value > 0 || !!input.axes?.some(value => value !== 0);
export function mappedControl(mapping: string, button: number): string | undefined {
  return mapping === 'standard' ? controls.find(c => c.gamepadButton === button)?.id : undefined;
}
const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
export function stickAxes(x: number, y: number): [number, number] {
  x = clamp(x, -1, 1); y = clamp(y, -1, 1);
  const length = Math.hypot(x, y), deadZone = .12;
  if (length <= deadZone) return [0, 0];
  const scale = (Math.min(length, 1) - deadZone) / (1 - deadZone) / length;
  return [x * scale, y * scale];
}
export function readControls(pad: Gamepad): ControlInput[] {
  if (pad.mapping !== 'standard') return [];
  return controls.filter(c => c.gamepadButton !== undefined || c.gamepadAxes).map(c => {
    const button = c.gamepadButton === undefined ? undefined : pad.buttons[c.gamepadButton];
    return {
      controlId: c.id, pressed: button?.pressed ?? false,
      value: clamp(button?.value ?? 0, 0, 1),
      ...(c.gamepadAxes ? { axes: stickAxes(pad.axes[c.gamepadAxes[0]] ?? 0, pad.axes[c.gamepadAxes[1]] ?? 0) } : {}),
    };
  });
}
const messages: Record<GamepadState['status'], string> = {
  disabled: 'Controller input disabled.',
  waiting: 'No controller visible. Pair it with your computer, focus this page and press a controller button.',
  connected: 'Standard controller connected. Live input feedback is active.',
  unsupported: 'Unknown controller mapping. Live feedback and physical checks are disabled for this controller.',
  unavailable: 'Gamepad API unavailable or blocked. Use HTTPS or localhost and check the host permissions policy.',
  suspended: 'Controller input paused while the page is hidden.',
};

export class PhysicalInput {
  private previous?: { identity: string; pressed: boolean[] };
  private frame: number | undefined;
  private running = false;
  private signature = '';
  private selected?: number;
  constructor(
    private input: (id: string) => void,
    private report: (message: string) => void,
    private update: (state: GamepadState) => void = () => {},
  ) {}
  private publish(state: GamepadState) {
    const signature = JSON.stringify(state);
    if (signature === this.signature) return;
    const statusChanged = !this.signature || JSON.parse(this.signature).status !== state.status;
    this.signature = signature;
    this.update(state);
    if (statusChanged && this.running && this.signature === signature) this.report(messages[state.status]);
  }
  private clear(status: GamepadState['status']) {
    this.previous = undefined; this.selected = undefined;
    this.publish({ status, controller: null, controls: [] });
  }
  private sample = () => {
    if (!this.running) return;
    if (document.hidden) { this.clear('suspended'); return; }
    let pads: Gamepad[];
    try {
      if (!navigator.getGamepads) { this.clear('unavailable'); return; }
      pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => !!pad?.connected);
    } catch { this.clear('unavailable'); return; }
    const supported = pads.filter(p => p.mapping === 'standard');
    const pad = supported.find(p => p.index === this.selected) ?? supported[0];
    if (!pad) {
      this.previous = undefined; this.selected = undefined;
      const unknown = pads[0];
      this.publish({ status: unknown ? 'unsupported' : 'waiting', controller: unknown ? { index: unknown.index, id: unknown.id, mapping: unknown.mapping } : null, controls: [] });
      return;
    }
    this.selected = pad.index;
    const identity = `${pad.index}:${pad.id}:${pad.mapping}`;
    const before = this.previous?.identity === identity ? this.previous.pressed : undefined;
    // Establish a baseline on connection/resume: held controls render but do not complete lessons.
    this.previous = { identity, pressed: pad.buttons.map(button => button.pressed) };
    this.publish({ status: 'connected', controller: { index: pad.index, id: pad.id, mapping: pad.mapping }, controls: readControls(pad) });
    if (!this.running) return;
    pad.buttons.forEach((button, index) => {
      const id = mappedControl(pad.mapping, index);
      if (this.running && id && before && button.pressed && !before[index]) this.input(id);
    });
  };
  private poll = () => {
    this.frame = undefined;
    this.sample();
    if (this.running && !document.hidden && this.frame === undefined) this.frame = requestAnimationFrame(this.poll);
  };
  private visibility = () => {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.previous = undefined;
    this.poll();
  };
  private disconnected = (event: GamepadEvent) => {
    if (event.gamepad.index !== this.selected) return;
    this.clear(document.hidden ? 'suspended' : 'waiting');
  };
  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('gamepaddisconnected', this.disconnected);
    this.poll();
  }
  stop() {
    this.running = false;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('gamepaddisconnected', this.disconnected);
    this.clear('disabled');
  }
}
