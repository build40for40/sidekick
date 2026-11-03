export type View = 'front' | 'shoulders' | 'rear';
export type Motion = 'press' | 'trigger' | 'stick';
export interface Control {
  id: string; node: string; label: string; aliases: string[]; description: string;
  highlights: string[]; view: View; motion: Motion;
  movement: { axis: 'y' | 'x'; range: number; rotation?: boolean }; gamepadButton?: number;
  gamepadAxes?: [number, number]; position: [number, number, number];
}
const control = (id: string, label: string, aliases: string[], description: string, position: Control['position'], gamepadButton: number, motion: Motion = 'press', view: View = 'front'): Control => ({
  id, node: id, label, aliases, description, highlights: [id], view, motion, position, gamepadButton,
  movement: motion === 'trigger' ? { axis: 'x', range: .35, rotation: true } : { axis: 'y', range: -.075 },
});
export const controls: Control[] = [
  control('a', 'A', ['a button', 'bottom face button'], 'A is the lower button in the group of four on the right. Many games use it to confirm or jump; each game can differ.', [1.55,.36,.18], 0),
  control('b', 'B', ['b button'], 'B is the rightmost face button. Many games use it to go back.', [1.98,.36,-.24], 1),
  control('x', 'X', ['x button'], 'X is the leftmost face button.', [1.12,.36,-.24], 2),
  control('y', 'Y', ['y button'], 'Y is the top face button.', [1.55,.36,-.66], 3),
  control('left-bumper', 'LB', ['lb', 'left bumper', 'l1'], 'The left bumper is the narrow button on the top left edge. Give it a short press.', [-1.45,.32,-1.15], 4, 'press', 'shoulders'),
  control('right-bumper', 'RB', ['rb', 'right bumper', 'r1'], 'The right bumper is the narrow button on the top right edge. Give it a short press.', [1.45,.32,-1.15], 5, 'press', 'shoulders'),
  control('left-trigger', 'LT', ['lt', 'left trigger', 'l2'], 'The left trigger sits behind the left bumper. Squeeze it gradually, then let go.', [-1.45,-.06,-1.36], 6, 'trigger', 'rear'),
  control('right-trigger', 'RT', ['rt', 'right trigger', 'r2'], 'The right trigger sits behind the right bumper. Squeeze it gradually, then let go.', [1.45,-.06,-1.36], 7, 'trigger', 'rear'),
  control('view', 'View', ['view', 'back', 'select'], 'View is the small button left of the centre.', [-.45,.3,-.35], 8),
  control('menu', 'Menu', ['menu', 'start'], 'Menu is the small button right of the centre. Many games use it to pause.', [.45,.3,-.35], 9),
  {...control('left-stick', 'LS', ['left stick', 'left thumbstick', 'l3', 'clicking the stick', 'click the stick', 'stick clicking'], 'Clicking a stick means pressing it straight down like a button, without tilting it. Try the left stick.', [-1.45,.42,-.42], 10, 'stick'), gamepadAxes: [0,1]},
  {...control('right-stick', 'RS', ['right stick', 'right thumbstick', 'r3'], 'You can tilt the right stick to move it, or press straight down to click it like a button.', [.73,.42,.65], 11, 'stick'), gamepadAxes: [2,3]},
  control('dpad-up', '↑', ['d pad up', 'd-pad up', 'up'], 'This is the top arm of the directional pad, often called the D-pad.', [-.73,.31,.38], 12),
  control('dpad-down', '↓', ['d pad down', 'd-pad down', 'down'], 'This is the bottom arm of the D-pad.', [-.73,.31,.94], 13),
  control('dpad-left', '←', ['d pad left', 'd-pad left'], 'This is the left arm of the D-pad.', [-1.01,.31,.66], 14),
  control('dpad-right', '→', ['d pad right', 'd-pad right'], 'This is the right arm of the D-pad.', [-.45,.31,.66], 15),
];
export type ControlId = string;
export const byId = new Map(controls.map(c => [c.id, c]));
export const manifest = {
  name: 'Xbox-style reference controller', asset: null as string | null,
  temporary: true, controls,
  views: { front: [0,6.5,5.5], shoulders: [0,3,-5.7], rear: [0,-3.8,-5.6] } as Record<View, [number,number,number]>,
};
