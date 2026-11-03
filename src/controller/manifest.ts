import controller from '../../knowledge/controllers/ps5.json';
// Imported as a URL so the GLB is emitted beside the chunks and resolves wherever dist/ is deployed.
import controllerAsset from '../assets/controller.glb?url';
export type View = 'front' | 'shoulders' | 'rear';
export type Motion = 'press' | 'trigger' | 'stick';
export interface Control {
  id: string; node: string; label: string; glyph: string; aliases: string[]; description: string;
  highlights: string[]; view: View; motion: Motion;
  movement: { axis: 'x' | 'y' | 'z'; range: number; rotation?: boolean }; gamepadButton?: number;
  gamepadAxes?: [number, number]; position: [number, number, number];
}
// Only geometry, glyphs and standard Gamepad API indices live here. Names and IDs belong to the pack.
// `position` places the generated placeholder; the GLB supplies its own node transforms.
const layout: Record<string, { position: Control['position']; glyph?: string; button?: number; axes?: [number,number]; view?: View }> = {
  cross: { position: [1.55,.36,.18], glyph: '✕', button: 0 }, circle: { position: [1.98,.36,-.24], glyph: '○', button: 1 },
  square: { position: [1.12,.36,-.24], glyph: '□', button: 2 }, triangle: { position: [1.55,.36,-.66], glyph: '△', button: 3 },
  l1: { position: [-1.45,.32,-1.15], button: 4, view: 'shoulders' }, r1: { position: [1.45,.32,-1.15], button: 5, view: 'shoulders' },
  l2: { position: [-1.45,-.06,-1.36], button: 6, view: 'rear' }, r2: { position: [1.45,-.06,-1.36], button: 7, view: 'rear' },
  create: { position: [-.9,.3,-.65], button: 8 }, options: { position: [.9,.3,-.65], button: 9 },
  'left-stick': { position: [-.73,.42,.65], glyph: 'L3', button: 10, axes: [0,1] }, 'right-stick': { position: [.73,.42,.65], glyph: 'R3', button: 11, axes: [2,3] },
  'dpad-up': { position: [-1.55,.31,-.66], glyph: '▲', button: 12 }, 'dpad-down': { position: [-1.55,.31,.18], glyph: '▼', button: 13 },
  'dpad-left': { position: [-1.97,.31,-.24], glyph: '◀', button: 14 }, 'dpad-right': { position: [-1.13,.31,-.24], glyph: '▶', button: 15 },
  ps: { position: [0,.3,.43], glyph: 'PS', button: 16 }, touchpad: { position: [0,.3,-.65] }, mute: { position: [0,.3,.82] },
};
/**
 * PS5 DualSense. Node names match src/assets/controller.glb. Control nodes sit inside the asset's
 * `controller` group, whose local frame is +Z up (out of the face), +Y towards the shoulders and
 * +X to the player's right: a press moves along local -Z and triggers hinge about local X.
 */
export const controls: Control[] = controller.buttons.map(button => {
  const geometry = layout[button.id];
  if (!geometry) throw Error(`Missing controller geometry: ${button.id}`);
  const motion = button.motion as Motion;
  const click = button.id === 'left-stick' ? 'L3' : 'R3';
  // Stick use fields in the pack include common game mappings; those are not universal controller facts.
  const description = motion === 'stick'
    ? `${click} means pressing the ${button.name.toLowerCase()} straight down until it clicks. Tilting the stick is different.`
    : `${button.name} is at the ${button.zone}. ${motion === 'trigger' ? 'Squeeze it gradually, then let go.' : 'Give it a short press.'}`;
  return { id: button.id, node: button.id, label: button.name, glyph: geometry.glyph ?? button.name, aliases: [button.name.toLowerCase(), ...button.aka.map(a => a.toLowerCase())], description,
    highlights: [button.id], motion, view: geometry.view ?? 'front', position: geometry.position,
    gamepadButton: geometry.button, gamepadAxes: geometry.axes,
    movement: motion === 'trigger' ? { axis: 'x', range: -.42, rotation: true } : motion === 'stick' ? { axis: 'z', range: -.03 } : { axis: 'z', range: -.022 },
  };
});
export type ControlId = string;
export const byId = new Map(controls.map(c => [c.id, c]));
export const manifest = {
  name: controller.name, asset: controllerAsset as string | null, temporary: false, controls,
  credit: '“Playstation 5 Dualsense” (https://skfb.ly/opKOx) by AHarmlessPotato, licensed under CC Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). Modified: parts separated, renamed and re-pivoted.',
  views: { front: [0,6.2,5.6], shoulders: [0,3.2,-6.4], rear: [0,-1.2,-7.4] } as Record<View, [number,number,number]>,
};
