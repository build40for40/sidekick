import { Object3D, Vector3, type Quaternion } from 'three';
import { type Control } from './manifest';
import { type ControlInput } from './gamepad';

export interface Rest { position: Vector3; quaternion: Quaternion }
/** Rebuild from the artist's local transform each frame; never accumulate offsets. */
export function applyInputMotion(node: Object3D, rest: Rest, control: Control, input: ControlInput, reduced: boolean) {
  node.position.copy(rest.position); node.quaternion.copy(rest.quaternion);
  if (reduced) return;
  if (input.axes) {
    node.rotateX(input.axes[1] * .35);
    if (node.userData.placeholder) node.rotateZ(-input.axes[0] * .35);
    else node.rotateY(input.axes[0] * .35);
  }
  const amount = control.motion === 'trigger' ? input.value : input.pressed ? 1 : 0;
  const axis = new Vector3(control.movement.axis === 'x' ? 1 : 0, control.movement.axis === 'y' ? 1 : 0, control.movement.axis === 'z' ? 1 : 0);
  if (control.movement.rotation) node.rotateOnAxis(axis, control.movement.range * amount);
  else if (node.userData.placeholder) node.translateY(-.075 * amount);
  else node.translateOnAxis(axis, control.movement.range * amount);
}
