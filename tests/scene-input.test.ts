// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Object3D, Scene } from 'three';
const render = vi.hoisted(() => ({ frame: undefined as (() => void) | undefined, draw: vi.fn() }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas'); shadowMap = {};
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {}
    render = render.draw;
    setAnimationLoop(callback: () => void) { render.frame = callback; }
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', () => ({ OrbitControls: class {
  target = { set() {} }; addEventListener() {} update() {} dispose() {}
} }));
import { ControllerScene } from '../src/controller/scene';
let scene: ControllerScene | undefined;
afterEach(() => { scene?.dispose(); scene = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); render.draw.mockClear(); });
function setup(reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const view = vi.fn(); scene = new ControllerScene(document.createElement('div'), vi.fn(), view);
  render.frame!();
  const model = render.draw.mock.lastCall![0] as Scene;
  const node = (id: string) => model.getObjectByName(id)!;
  const active = (node: Object3D) => node.children.some(child => (child as any).element?.classList.contains('active'));
  return { scene, view, node, active };
}
it('renders simultaneous held input, overrides a tutor animation, restores release and leaves the camera steady', () => {
  const { scene, view, node, active } = setup();
  const cross = node('cross'), circle = node('circle'), trigger = node('r2');
  const crossRest = cross.position.clone(), circleRest = circle.position.clone(), triggerRest = trigger.rotation.clone();
  scene.animate('circle', 'press');
  scene.setPhysicalInput([
    { controlId: 'cross', pressed: true, value: 1 },
    { controlId: 'r2', pressed: false, value: .6 },
  ]);
  render.frame!();
  expect(cross.position.y).toBeCloseTo(crossRest.y - .075);
  expect(trigger.rotation.x).toBeCloseTo(triggerRest.x + .35 * .6);
  expect(circle.position.toArray()).toEqual(circleRest.toArray());
  expect(active(cross)).toBe(true); expect(active(trigger)).toBe(true); expect(active(circle)).toBe(false);
  expect(view).not.toHaveBeenCalled();
  scene.clearDemonstration(); scene.setPhysicalInput([]); render.frame!();
  expect(cross.position.toArray()).toEqual(crossRest.toArray()); expect(trigger.rotation.toArray()).toEqual(triggerRest.toArray());
  expect(active(cross)).toBe(false); expect(active(trigger)).toBe(false);
});
it('keeps existing active feedback with reduced motion while leaving the model transforms at rest', () => {
  const { scene, node, active } = setup(true), stick = node('left-stick');
  const rest = { position: stick.position.clone(), rotation: stick.rotation.clone() };
  scene.setPhysicalInput([{ controlId: 'left-stick', pressed: true, value: 1, axes: [.8, -.5] }]); render.frame!();
  expect(stick.position.toArray()).toEqual(rest.position.toArray()); expect(stick.rotation.toArray()).toEqual(rest.rotation.toArray());
  expect(active(stick)).toBe(true);
});
