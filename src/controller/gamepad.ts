import { controls } from './manifest';
export function mappedControl(mapping: string, button: number): string | undefined {
  return mapping === 'standard' ? controls.find(c=>c.gamepadButton === button)?.id : undefined;
}
export class PhysicalInput {
  private previous = new Map<number, boolean[]>();
  private frame = 0;
  private status = '';
  constructor(private input: (id: string) => void, private report: (message: string) => void) {}
  start() {
    const poll = () => {
      const pads = Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
      const message = pads.length ? pads.some(p=>p.mapping === 'standard') ? 'Standard controller connected. Press a button to practise.' : 'Unknown controller mapping. Physical checks are disabled; virtual practice is available.' : 'No controller connected. Virtual practice is ready.';
      if (message !== this.status) { this.status = message; this.report(message); }
      const active = new Set(pads.map(p=>p.index));
      for (const index of this.previous.keys()) if (!active.has(index)) this.previous.delete(index);
      for (const pad of pads) {
        const before = this.previous.get(pad.index);
        pad.buttons.forEach((button,i) => {
          const id = mappedControl(pad.mapping, i);
          // First sample establishes baseline; connecting a held button is not a press.
          if (id && before && button.pressed && !before[i]) this.input(id);
        });
        this.previous.set(pad.index,pad.buttons.map(b=>b.pressed));
      }
      this.frame = requestAnimationFrame(poll);
    }; poll();
  }
  stop() { cancelAnimationFrame(this.frame); this.previous.clear(); }
}
