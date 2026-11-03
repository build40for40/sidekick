// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Object3D, Scene, type PerspectiveCamera } from 'three';
import { manifest } from '../src/controller/manifest';
const render = vi.hoisted(() => ({ frame: undefined as (() => void) | undefined, draw: vi.fn(), camera: undefined as PerspectiveCamera | undefined, orbitStart: undefined as (() => void) | undefined }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, PMREMGenerator: class {
    fromScene() { return { texture: new actual.Texture() }; } dispose() {}
  }, WebGLRenderer: class {
    domElement = document.createElement('canvas'); shadowMap = {};
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {}
    render = render.draw;
    setAnimationLoop(callback: () => void) { render.frame = callback; }
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => ({ OrbitControls: class {
  target = new Object3D().position; addEventListener(event: string,callback: () => void) { if(event==='start')render.orbitStart=callback; } update() {} dispose() {}
} }));
vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({ EffectComposer: class {
  scene?: Scene;
  addPass(pass: { scene?: Scene }) { if (pass.scene) this.scene = pass.scene; }
  render() { render.draw(this.scene); } setSize() {} dispose() {}
} }));
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({ RenderPass: class { constructor(public scene: Scene,camera: PerspectiveCamera) { render.camera=camera; } } }));
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({ UnrealBloomPass: class { dispose() {} } }));
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));
import { ControllerScene } from '../src/controller/scene';
let scene: ControllerScene | undefined;
afterEach(() => { scene?.dispose(); scene = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); render.draw.mockClear(); });
function setup(reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, arc() {}, stroke() {} } as any);
  const view = vi.fn(); scene = new ControllerScene(document.createElement('div'), vi.fn(), view);
  render.frame!();
  const model = render.draw.mock.lastCall![0] as Scene;
  const node = (id: string) => model.getObjectByName(id)!;
  const active = (node: Object3D) => node.children.some(child => (child as any).element?.classList.contains('active'));
  return { scene, view, node, active };
}
it('stays still at rest, settles after a completed demonstration, and stops an in-progress motion on exit', () => {
  let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const { scene,view,node }=setup();const camera=render.camera!;
  const initial=camera.position.clone(),rest=node('r2').quaternion.clone();
  for(let i=0;i<10;i++){now+=1000;render.frame!();}
  expect(camera.position.toArray()).toEqual(initial.toArray());expect(view).not.toHaveBeenCalled();
  scene.demonstrate({action:'squeeze',controlId:'r2',say:'Squeeze R2.'},1300);
  now+=1500;render.frame!();now+=3600;render.frame!();expect(view).toHaveBeenLastCalledWith('front');
  scene.demonstrate({action:'squeeze',controlId:'r2',say:'Squeeze R2.'},1300);now+=400;render.frame!();
  scene.clear();expect(node('r2').quaternion.toArray()).toEqual(rest.toArray());
  for(let i=0;i<300;i++){now+=16;render.frame!();}
  expect(camera.position.distanceTo(new Object3D().position.set(...manifest.views.front))).toBeLessThan(.02);
  const settled=camera.position.clone();now+=10000;render.frame!();expect(camera.position.toArray()).toEqual(settled.toArray());
});
it('preserves a camera angle chosen by dragging instead of automatically returning it to front', () => {
  let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const { scene,view }=setup();scene.highlight('r2');render.orbitStart!();
  render.camera!.position.set(3,4,5);view.mockClear();now+=20000;render.frame!();
  expect(render.camera!.position.toArray()).toEqual([3,4,5]);expect(view).not.toHaveBeenCalled();
});
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
  expect(trigger.rotation.x).toBeCloseTo(triggerRest.x - .42 * .6);
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
