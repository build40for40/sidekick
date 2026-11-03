import { Object3D, Vector3, type Euler } from 'three';
import { type Control } from './manifest';
import { type ControlInput } from './gamepad';

export interface Rest { position: Vector3; rotation: Euler }
/** Rebuild from the artist's local transform each frame; never accumulate offsets. */
export function applyInputMotion(node: Object3D, rest: Rest, control: Control, input: ControlInput, reduced: boolean) {
  node.position.copy(rest.position); node.rotation.copy(rest.rotation);
  if (reduced) return;
  if (input.axes) {
    node.rotateX(input.axes[1] * .35);
    node.rotateZ(-input.axes[0] * .35);
  }
  const amount = control.motion === 'trigger' ? input.value : input.pressed ? 1 : 0;
  const axis = new Vector3(control.movement.axis === 'x' ? 1 : 0, control.movement.axis === 'y' ? 1 : 0, 0);
  if (control.movement.rotation) node.rotateOnAxis(axis, control.movement.range * amount);
  else node.translateOnAxis(axis, control.movement.range * amount);
}
