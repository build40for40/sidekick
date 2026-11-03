import controller from '../../knowledge/controllers/ps5.json';
export type View = 'front' | 'shoulders' | 'rear';
export type Motion = 'press' | 'trigger' | 'stick';
export interface Control {
  id: string; node: string; label: string; aliases: string[]; description: string;
  highlights: string[]; view: View; motion: Motion;
  movement: { axis: 'y' | 'x'; range: number; rotation?: boolean }; gamepadButton?: number;
  gamepadAxes?: [number, number]; position: [number, number, number];
}
// Only geometry and standard Gamepad API indices live here. Names and IDs belong to the pack.
const layout: Record<string, { position: Control['position']; button?: number; axes?: [number,number]; view?: View }> = {
  cross: { position: [1.55,.36,.18], button: 0 }, circle: { position: [1.98,.36,-.24], button: 1 },
  square: { position: [1.12,.36,-.24], button: 2 }, triangle: { position: [1.55,.36,-.66], button: 3 },
  l1: { position: [-1.45,.32,-1.15], button: 4, view: 'shoulders' }, r1: { position: [1.45,.32,-1.15], button: 5, view: 'shoulders' },
  l2: { position: [-1.45,-.06,-1.36], button: 6, view: 'rear' }, r2: { position: [1.45,-.06,-1.36], button: 7, view: 'rear' },
  create: { position: [-.9,.3,-.65], button: 8 }, options: { position: [.9,.3,-.65], button: 9 },
  'left-stick': { position: [-.73,.42,.65], button: 10, axes: [0,1] }, 'right-stick': { position: [.73,.42,.65], button: 11, axes: [2,3] },
  'dpad-up': { position: [-1.55,.31,-.66], button: 12 }, 'dpad-down': { position: [-1.55,.31,.18], button: 13 },
  'dpad-left': { position: [-1.97,.31,-.24], button: 14 }, 'dpad-right': { position: [-1.13,.31,-.24], button: 15 },
  ps: { position: [0,.3,.43], button: 16 }, touchpad: { position: [0,.3,-.65] }, mute: { position: [0,.3,.82] },
};
export const controls: Control[] = controller.buttons.map(button => {
  const geometry = layout[button.id];
  if (!geometry) throw Error(`Missing controller geometry: ${button.id}`);
  const motion = button.motion as Motion;
  const click = button.id === 'left-stick' ? 'L3' : 'R3';
  // Stick use fields in the pack include common game mappings; those are not universal controller facts.
  const description = motion === 'stick'
    ? `${click} means pressing the ${button.name.toLowerCase()} straight down until it clicks. Tilting the stick is different.`
    : `${button.name} is at the ${button.zone}. ${motion === 'trigger' ? 'Squeeze it gradually, then let go.' : 'Give it a short press.'}`;
  return { id: button.id, node: button.id, label: button.name, aliases: [button.name.toLowerCase(), ...button.aka.map(a => a.toLowerCase())], description,
    highlights: [button.id], motion, view: geometry.view ?? 'front', position: geometry.position,
    gamepadButton: geometry.button, gamepadAxes: geometry.axes,
    movement: motion === 'trigger' ? { axis: 'x', range: .35, rotation: true } : { axis: 'y', range: -.075 },
  };
});
export type ControlId = string;
export const byId = new Map(controls.map(c => [c.id, c]));
export const manifest = {
  name: controller.name, asset: null as string | null, temporary: true, controls,
  views: { front: [0,6.5,5.5], shoulders: [0,3,-5.7], rear: [0,-3.8,-5.6] } as Record<View, [number,number,number]>,
};
