import fortnite from '../../knowledge/games/fortnite.json';
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
  control('l1', 'L1', 'L1', ['l1', 'left bumper', 'lb', 'left shoulder'], 'L1 is the narrow button on the top left edge, above the trigger. Give it a short press.', [-1.45,.32,-1.15], 4, 'press', 'shoulders'),
  control('r1', 'R1', 'R1', ['r1', 'right bumper', 'rb', 'right shoulder'], 'R1 is the narrow button on the top right edge, above the trigger. Give it a short press.', [1.45,.32,-1.15], 5, 'press', 'shoulders'),
  control('l2', 'L2', 'L2', ['l2', 'left trigger', 'lt'], 'L2 is the left trigger, under your left index finger behind L1. Squeeze it in, then let go.', [-1.45,-.06,-1.36], 6, 'trigger', 'rear'),
  control('r2', 'R2', 'R2', ['r2', 'right trigger', 'rt'], 'R2 is the right trigger, under your right index finger behind R1. Squeeze it in, then let go.', [1.45,-.06,-1.36], 7, 'trigger', 'rear'),
  control('create', 'Create', 'Create', ['create', 'share', 'select', 'view'], 'Create is the small button at the top left of the touchpad. It captures screenshots and clips.', [-.45,.3,-.35], 8),
  control('options', 'Options', 'Options', ['options', 'menu', 'start', 'pause'], 'Options is the small button at the top right of the touchpad. Most games use it to pause.', [.45,.3,-.35], 9),
  {...control('left-stick', 'L3', 'L3', ['left stick', 'left thumbstick', 'l3', 'clicking the stick', 'click the stick', 'stick clicking'], 'The left stick moves your character. Clicking it (L3) means pressing straight down like a button, without tilting.', [-1.45,.42,-.42], 10, 'stick'), gamepadAxes: [0,1]},
  {...control('right-stick', 'R3', 'R3', ['right stick', 'right thumbstick', 'r3'], 'The right stick moves the camera. You can also press it straight down (R3) to click it like a button.', [.73,.42,.65], 11, 'stick'), gamepadAxes: [2,3]},
  control('dpad-up', 'Up', '▲', ['d pad up', 'd-pad up', 'dpad up', 'up'], 'This is the top arm of the directional pad, often called the D-pad.', [-.73,.31,.38], 12),
  control('dpad-down', 'Down', '▼', ['d pad down', 'd-pad down', 'dpad down', 'down'], 'This is the bottom arm of the D-pad.', [-.73,.31,.94], 13),
  control('dpad-left', 'Left', '◀', ['d pad left', 'd-pad left', 'dpad left'], 'This is the left arm of the D-pad.', [-1.01,.31,.66], 14),
  control('dpad-right', 'Right', '▶', ['d pad right', 'd-pad right', 'dpad right'], 'This is the right arm of the D-pad.', [-.45,.31,.66], 15),
  control('ps', 'PS button', 'PS', ['ps button', 'playstation button', 'home button', 'ps'], 'The PS button sits between the sticks. It opens the console menu.', [0,.3,.2], 16),
  {...control('mute', 'Mute', 'Mute', ['mute', 'mute button', 'microphone button', 'mic button'], 'Mute is the small bar just below the PS button. It turns your microphone on and off.', [0,.3,.45], 18), gamepadButton: undefined},
  control('touchpad', 'Touchpad', 'Touchpad', ['touchpad', 'touch pad', 'trackpad'], 'The touchpad is the large flat panel at the top centre. You can swipe it or press it down like a button.', [0,.3,-.7], 17),
];
export type ControlId = string;
export const byId = new Map(controls.map(c => [c.id, c]));

/** A guided combo: each step lights up one control. `hold` keeps it pressed for the duration. */
export interface SequenceStep { control: string; action: 'press' | 'hold' | 'squeeze' | 'tilt'; caption: string; ms?: number }
export interface Sequence { id: string; title: string; game: string; aliases: string[]; summary: string; steps: SequenceStep[] }

/** Raw knowledge pack (owner: Samira). Bindings come only from here. */
interface PackStep { controlId: string; action: 'press' | 'squeeze' | 'tilt'; hold?: boolean; times?: number }
interface PackAction { id: string; plain: string; mode: string; ps5: PackStep[]; verified: string | false; needs?: string }
const pack = fortnite as { actions: PackAction[]; preset: string };
const usable = pack.actions.filter(a => a.verified !== false && a.ps5.every(s => byId.has(s.controlId)));
const packById = new Map(usable.map(a => [a.id, a]));
const verb = (s: PackStep) => s.action === 'tilt' ? 'Tilt' : s.hold ? 'Hold' : s.action === 'squeeze' ? 'Squeeze' : s.controlId.endsWith('stick') ? 'Click' : 'Press';
const stepsOf = (id: string): SequenceStep[] => {
  const a = packById.get(id); if (!a) return [];
  const own = a.ps5.flatMap(s => Array.from({ length: s.times ?? 1 }, (_, i) => ({
    control: s.controlId, action: (s.hold ? 'hold' : s.action) as SequenceStep['action'],
    caption: `${verb(s)} ${byId.get(s.controlId)!.label}${i ? ' again' : ''} · ${a.plain}`, ms: s.hold ? 1500 : undefined,
  })));
  return a.needs ? [...stepsOf(a.needs), ...own] : own;
};
const words = (a: PackAction) => [a.id.replaceAll('_', ' '), a.plain.toLowerCase().replace(/\s*\(.*\)/, '')];
const extraAliases: Record<string, string[]> = {
  crouch: ['duck', 'sneak'], reload: ['more ammo'], interact: ['open a chest', 'open chest', 'pick up', 'open a door'], shoot: ['fire'],
  next_item: ['switch weapon', 'change weapon', 'next weapon'], previous_item: ['previous weapon'], place_wall: ['place a wall', 'wall'],
  place_stairs: ['place a ramp', 'ramp', 'stairs'], place_floor: ['build a floor', 'floor'], place_roof: ['build a roof', 'roof'],
  build_mode: ['build mode', 'building'], map: ['open the map'], emote: ['dance'], edit_piece: ['edit'],
};
const shortTitles: Record<string, string> = { crouch: 'Crouch', reload: 'Reload', next_item: 'Switch weapon', previous_item: 'Previous weapon', shoot: 'Shoot', aim: 'Aim', interact: 'Open / pick up', move: 'Move', look: 'Look around', place_wall: 'Place a wall', place_stairs: 'Place a ramp', build_mode: 'Build mode' };
/** Combos that chain two pack actions. */
const combos: Sequence[] = [
  { id: 'aim_shoot', title: 'Aim & shoot', game: 'Fortnite', aliases: ['aim and shoot', 'aim then shoot'], summary: 'Hold L2 to aim, then squeeze R2 to shoot.', steps: [...stepsOf('aim'), ...stepsOf('shoot')] },
  { id: 'wall_back', title: 'Build a wall', game: 'Fortnite', aliases: ['build a wall', 'quick wall', 'cover'], summary: 'Circle switches to build mode, R2 places a wall, Circle again takes your weapon back out.', steps: [...stepsOf('place_wall'), { ...stepsOf('build_mode')[0], caption: 'Press Circle · Back to your weapon' }] },
  { id: 'ramp_jump', title: 'Build a ramp', game: 'Fortnite', aliases: ['build a ramp', 'ramp and jump', 'climb'], summary: 'Circle for build mode, L2 places a ramp, Cross jumps onto it.', steps: [...stepsOf('place_stairs'), ...stepsOf('jump')] },
].filter(c => c.steps.length);
/** Fortnite on PS5, from the knowledge pack (Builder Pro defaults; "web" = from a published source, not yet checked on a console). */
export const sequences: Sequence[] = [
  ...combos,
  ...usable.map(a => ({ id: a.id, title: shortTitles[a.id] ?? a.plain, game: 'Fortnite', aliases: [...words(a), ...(extraAliases[a.id] ?? [])],
    summary: stepsOf(a.id).map(s => s.caption.split(' · ')[0]).join(', then ') + ` to ${a.plain.charAt(0).toLowerCase()}${a.plain.slice(1)}.`, steps: stepsOf(a.id) })),
];
/** Shown as quick buttons under the controller. */
export const featuredMoves = ['jump', 'crouch', 'reload', 'aim_shoot', 'wall_back', 'ramp_jump', 'next_item'];
export const sequenceById = new Map(sequences.map(s => [s.id, s]));

export const manifest = {
  name: 'PS5 DualSense', asset: '/assets/controller.glb' as string | null,
  temporary: false, controls,
  credit: '“Playstation 5 Dualsense” (https://skfb.ly/opKOx) by AHarmlessPotato, licensed under CC Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Modified: parts separated, renamed and re-pivoted.',
  views: { front: [0,6.2,5.6], shoulders: [0,3.2,-6.4], rear: [0,-1.2,-7.4] } as Record<View, [number,number,number]>,
};
