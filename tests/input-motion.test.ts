import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { applyInputMotion } from '../src/controller/input-motion';
import { byId } from '../src/controller/manifest';

function fixture() {
  const node = new Object3D(); node.position.set(3, 4, 5); node.rotation.set(.2, .4, -.3);
  return { node, rest: { position: node.position.clone(), rotation: node.rotation.clone() } };
}
describe('physical transforms', () => {
  it('preserves authored local transforms over repeated presses and restores them on release', () => {
    const { node, rest } = fixture(), control = byId.get('cross')!;
    const expected = node.clone(); expected.translateY(control.movement.range);
    for (let i = 0; i < 100; i++) applyInputMotion(node, rest, control, { controlId: 'cross', pressed: true, value: 1 }, false);
    expect(node.position.toArray()).toEqual(expected.position.toArray());
    applyInputMotion(node, rest, control, { controlId: 'cross', pressed: false, value: 0 }, false);
    expect(node.position.toArray()).toEqual(rest.position.toArray()); expect(node.rotation.toArray()).toEqual(rest.rotation.toArray());
  });
  it('uses analog trigger travel and combines stick tilt with a separate click', () => {
    const { node, rest } = fixture(), trigger = byId.get('l2')!, stick = byId.get('left-stick')!;
    const expected = node.clone(); expected.rotateX(trigger.movement.range * .4);
    applyInputMotion(node, rest, trigger, { controlId: 'l2', pressed: false, value: .4 }, false);
    expect(node.quaternion.toArray()).toEqual(expected.quaternion.toArray());
    expected.position.copy(rest.position); expected.rotation.copy(rest.rotation);
    expected.rotateX(-.5 * .35); expected.rotateZ(-.75 * .35); expected.translateY(stick.movement.range);
    applyInputMotion(node, rest, stick, { controlId: stick.id, pressed: true, value: 1, axes: [.75, -.5] }, false);
    expect(node.position.toArray()).toEqual(expected.position.toArray()); expect(node.quaternion.toArray()).toEqual(expected.quaternion.toArray());
    applyInputMotion(node, rest, stick, { controlId: stick.id, pressed: true, value: 1, axes: [.75, -.5] }, true);
    expect(node.position.toArray()).toEqual(rest.position.toArray()); expect(node.rotation.toArray()).toEqual(rest.rotation.toArray());
  });
});
