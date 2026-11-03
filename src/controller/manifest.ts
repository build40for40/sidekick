export type View = 'front' | 'shoulders' | 'rear';
export type Motion = 'press' | 'trigger' | 'stick';
export interface Control {
  id: string; node: string; label: string; glyph: string; aliases: string[]; description: string;
  highlights: string[]; view: View; motion: Motion;
  movement: { axis: 'x' | 'y' | 'z'; range: number; rotation?: boolean }; gamepadButton?: number;
  gamepadAxes?: [number, number]; position: [number, number, number];
}
/**
 * PS5 DualSense. Node names match public/assets/controller.glb. Control nodes sit inside the
 * asset's `controller` group, whose local frame is +Z up (out of the face), +Y towards the
 * shoulders and +X to the player's right; a press moves along local -Z.
 */
const control = (id: string, label: string, glyph: string, aliases: string[], description: string, position: Control['position'], gamepadButton: number, motion: Motion = 'press', view: View = 'front'): Control => ({
  id, node: id, label, glyph, aliases, description, highlights: [id], view, motion, position, gamepadButton,
  movement: motion === 'trigger' ? { axis: 'x', range: -.42, rotation: true } : motion === 'stick' ? { axis: 'z', range: -.03 } : { axis: 'z', range: -.022 },
});
export const controls: Control[] = [
  control('cross', 'Cross', '✕', ['cross', 'x button', 'x', 'bottom face button', 'cross button'], 'Cross (✕) is the bottom button of the four on the right. Many games use it to jump or confirm.', [1.55,.36,.18], 0),
  control('circle', 'Circle', '○', ['circle', 'o button', 'circle button', 'right face button'], 'Circle (○) is the right-hand button of the four on the right. Many games use it to go back or cancel.', [1.98,.36,-.24], 1),
  control('square', 'Square', '□', ['square', 'square button', 'left face button'], 'Square (□) is the left-hand button of the four on the right. Often used to reload or interact.', [1.12,.36,-.24], 2),
  control('triangle', 'Triangle', '△', ['triangle', 'triangle button', 'top face button'], 'Triangle (△) is the top button of the four on the right.', [1.55,.36,-.66], 3),
  control('left-bumper', 'L1', 'L1', ['l1', 'left bumper', 'lb', 'left shoulder'], 'L1 is the narrow button on the top left edge, above the trigger. Give it a short press.', [-1.45,.32,-1.15], 4, 'press', 'shoulders'),
  control('right-bumper', 'R1', 'R1', ['r1', 'right bumper', 'rb', 'right shoulder'], 'R1 is the narrow button on the top right edge, above the trigger. Give it a short press.', [1.45,.32,-1.15], 5, 'press', 'shoulders'),
  control('left-trigger', 'L2', 'L2', ['l2', 'left trigger', 'lt'], 'L2 is the left trigger, under your left index finger behind L1. Squeeze it in, then let go.', [-1.45,-.06,-1.36], 6, 'trigger', 'rear'),
  control('right-trigger', 'R2', 'R2', ['r2', 'right trigger', 'rt'], 'R2 is the right trigger, under your right index finger behind R1. Squeeze it in, then let go.', [1.45,-.06,-1.36], 7, 'trigger', 'rear'),
  control('create', 'Create', 'Create', ['create', 'share', 'select', 'view'], 'Create is the small button at the top left of the touchpad. It captures screenshots and clips.', [-.45,.3,-.35], 8),
  control('options', 'Options', 'Options', ['options', 'menu', 'start', 'pause'], 'Options is the small button at the top right of the touchpad. Most games use it to pause.', [.45,.3,-.35], 9),
  {...control('left-stick', 'L3', 'L3', ['left stick', 'left thumbstick', 'l3', 'clicking the stick', 'click the stick', 'stick clicking'], 'The left stick moves your character. Clicking it (L3) means pressing straight down like a button, without tilting.', [-1.45,.42,-.42], 10, 'stick'), gamepadAxes: [0,1]},
  {...control('right-stick', 'R3', 'R3', ['right stick', 'right thumbstick', 'r3'], 'The right stick moves the camera. You can also press it straight down (R3) to click it like a button.', [.73,.42,.65], 11, 'stick'), gamepadAxes: [2,3]},
  control('dpad-up', 'Up', '▲', ['d pad up', 'd-pad up', 'dpad up', 'up'], 'This is the top arm of the directional pad, often called the D-pad.', [-.73,.31,.38], 12),
  control('dpad-down', 'Down', '▼', ['d pad down', 'd-pad down', 'dpad down', 'down'], 'This is the bottom arm of the D-pad.', [-.73,.31,.94], 13),
  control('dpad-left', 'Left', '◀', ['d pad left', 'd-pad left', 'dpad left'], 'This is the left arm of the D-pad.', [-1.01,.31,.66], 14),
  control('dpad-right', 'Right', '▶', ['d pad right', 'd-pad right', 'dpad right'], 'This is the right arm of the D-pad.', [-.45,.31,.66], 15),
  control('ps', 'PS button', 'PS', ['ps button', 'playstation button', 'home button', 'ps'], 'The PS button sits between the sticks. It opens the console menu.', [0,.3,.2], 16),
  control('touchpad', 'Touchpad', 'Touchpad', ['touchpad', 'touch pad', 'trackpad'], 'The touchpad is the large flat panel at the top centre. You can swipe it or press it down like a button.', [0,.3,-.7], 17),
];
export type ControlId = string;
export const byId = new Map(controls.map(c => [c.id, c]));

/** A guided combo: each step lights up one control. `hold` keeps it pressed for the duration. */
export interface SequenceStep { control: string; action: 'press' | 'hold' | 'squeeze' | 'tilt'; caption: string; ms?: number }
export interface Sequence { id: string; title: string; game: string; aliases: string[]; summary: string; steps: SequenceStep[] }

/**
 * Fortnite on PS5 using the default Builder Pro layout. DEMO DATA: check each binding in-game
 * (Settings → Controller) before treating it as verified. Players can remap any of these.
 */
export const sequences: Sequence[] = [
  { id: 'jump', title: 'Jump', game: 'Fortnite', aliases: ['jump', 'hop'], summary: 'Tap Cross to jump.',
    steps: [{ control: 'cross', action: 'press', caption: 'Tap Cross to jump' }] },
  { id: 'crouch', title: 'Crouch', game: 'Fortnite', aliases: ['crouch', 'duck', 'sneak'], summary: 'Click the right stick to crouch.',
    steps: [{ control: 'right-stick', action: 'press', caption: 'Press the right stick down (R3) to crouch' }] },
  { id: 'reload', title: 'Reload', game: 'Fortnite', aliases: ['reload', 'more ammo', 'interact', 'open a chest', 'open chest', 'pick up'], summary: 'Square reloads. Hold it to open chests and pick things up.',
    steps: [{ control: 'square', action: 'press', caption: 'Tap Square to reload' }] },
  { id: 'aim-shoot', title: 'Aim & shoot', game: 'Fortnite', aliases: ['aim and shoot', 'aim', 'shoot', 'fire', 'aim down sights', 'ads'], summary: 'Hold L2 to aim, then squeeze R2 to shoot.',
    steps: [
      { control: 'left-trigger', action: 'hold', caption: 'Hold L2 to aim', ms: 1400 },
      { control: 'right-trigger', action: 'squeeze', caption: 'Squeeze R2 to shoot' },
    ] },
  { id: 'build-wall', title: 'Build a wall', game: 'Fortnite', aliases: ['build a wall', 'wall', 'build', 'building', 'cover'], summary: 'Circle switches to build mode, R2 places a wall.',
    steps: [
      { control: 'circle', action: 'press', caption: 'Press Circle for build mode' },
      { control: 'right-trigger', action: 'squeeze', caption: 'Squeeze R2 to place a wall' },
      { control: 'circle', action: 'press', caption: 'Press Circle to get your weapon back' },
    ] },
  { id: 'build-ramp', title: 'Build a ramp', game: 'Fortnite', aliases: ['build a ramp', 'ramp', 'stairs', 'climb'], summary: 'Circle for build mode, L2 places a ramp, Cross jumps up it.',
    steps: [
      { control: 'circle', action: 'press', caption: 'Press Circle for build mode' },
      { control: 'left-trigger', action: 'squeeze', caption: 'Squeeze L2 to place a ramp' },
      { control: 'cross', action: 'press', caption: 'Tap Cross to jump onto it' },
    ] },
  { id: 'switch-weapon', title: 'Switch weapon', game: 'Fortnite', aliases: ['switch weapon', 'change weapon', 'next weapon', 'swap weapon', 'switch gun'], summary: 'R1 moves to your next item, L1 goes back.',
    steps: [
      { control: 'right-bumper', action: 'press', caption: 'Press R1 for the next item' },
      { control: 'left-bumper', action: 'press', caption: 'Press L1 to go back' },
    ] },
];
export const sequenceById = new Map(sequences.map(s => [s.id, s]));

export const manifest = {
  name: 'PS5 DualSense', asset: '/assets/controller.glb' as string | null,
  temporary: false, controls,
  credit: '“Playstation 5 Dualsense” (https://skfb.ly/opKOx) by AHarmlessPotato, licensed under CC Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Modified: parts separated, renamed and re-pivoted.',
  views: { front: [0,6.2,5.6], shoulders: [0,3.2,-6.4], rear: [0,-1.2,-7.4] } as Record<View, [number,number,number]>,
};
