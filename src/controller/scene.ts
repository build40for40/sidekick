import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { manifest, controls, byId, type View } from './manifest';
import { replySteps, type TutorReply, type TutorStep } from '../tutor/schema';

interface Rest { position: THREE.Vector3; quaternion: THREE.Quaternion }
type MotionKind = 'press' | 'hold' | 'squeeze' | 'tilt';
interface Motion { id: string; kind: MotionKind; start: number; duration: number; times: number; direction?: TutorStep['direction']; flashed: number; resolve?: () => void }
interface Ripple { sprite: THREE.Sprite; start: number }

const ACCENT = new THREE.Color('#a970ff');
const ACCENT_HOT = new THREE.Color('#e3ccff');
const ease = (t: number) => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
// Overall stage brightness. Scales lights, glow and bloom only; polish() keeps the clearcoat gloss.
const LUMA = .5;
const BASE_FOV = 32;
/** After the app turns the camera to show a control, return to the flat front view this long after everything stops. */
const SETTLE_MS = 3500;

function radialTexture(stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!; const grad = g.createRadialGradient(128,128,0,128,128,128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col)); g.fillStyle = grad; g.fillRect(0,0,256,256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Dispose geometry, materials, their textures and light shadow maps below a root. */
function disposeTree(root: THREE.Object3D) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
    if (object instanceof THREE.Light) (object as THREE.Light & { shadow?: THREE.LightShadow }).shadow?.dispose();
  });
}
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.shadowColor = '#c9a6ff'; g.shadowBlur = 24;
  g.beginPath(); g.arc(128,128,100,0,Math.PI*2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Soft light shaft from the spotlight to the selected control. */
function makeBeam() {
  const geometry = new THREE.CylinderGeometry(.05, 1, 1, 48, 1, true); geometry.translate(0, -.5, 0); geometry.rotateX(-Math.PI/2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: ACCENT.clone() }, opacity: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY=-position.z; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge=pow(abs(dot(vN,vV)),1.6); float fade=smoothstep(0.,.25,vY)*(1.-smoothstep(.75,1.,vY)); gl_FragColor=vec4(color, opacity*edge*fade*.55); }`,
  });
  return new THREE.Mesh(geometry, material);
}

export class ControllerScene {
  private resizeObserver: ResizeObserver;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(BASE_FOV,1,.1,80);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private labels = new CSS2DRenderer();
  private orbit: OrbitControls;
  private model = new THREE.Group();
  private stage = new THREE.Group();
  private nodes = new Map<string, THREE.Object3D>();
  private rests = new Map<string, Rest>();
  private glowMaterials = new Map<string, THREE.MeshStandardMaterial[]>();
  private labelNodes = new Map<string, HTMLElement>();
  private motion?: Motion;
  private ripples: Ripple[] = [];
  private targetCamera?: THREE.Vector3;
  private targetLook = new THREE.Vector3();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private selected?: string;
  private hovered?: string;
  private hints = true;
  private focus = 0; // 0 = studio lighting, 1 = spotlight on the selected control
  private hemi = new THREE.HemisphereLight(0xe8e4ff, 0x1b1426, .5);
  private key = new THREE.DirectionalLight(0xffffff, 1.8);
  private spot = new THREE.SpotLight(0xf1e6ff, 0, 30, .22, .55, 1.2);
  private beam = makeBeam();
  private halo: THREE.Sprite;
  private ringTex = ringTexture();
  private autoFramed = false; // the app, not the user, moved the camera
  private disposed = false;
  private lastInteraction = performance.now();
  private lastFrame = performance.now();

  constructor(private host: HTMLElement, private select: (id:string)=>void, private onView: (view:View)=>void = ()=>{}) {
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .72; r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0);
    r.domElement.setAttribute('aria-label','Interactive 3D PS5 controller. Drag to orbit. Select a control or use Tab to reach the keyboard controls.');
    this.host.append(r.domElement);
    Object.assign(this.labels.domElement.style, { position:'absolute', inset:'0', pointerEvents:'none' }); this.host.append(this.labels.domElement);

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
    this.scene.environmentIntensity = .55 * LUMA;

    this.camera.position.set(...manifest.views.front);
    this.orbit = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.orbit, { enableDamping: !this.reduced, dampingFactor: .08, minDistance: 3.2, maxDistance: 13, enablePan: false });
    this.orbit.addEventListener('start', () => { this.targetCamera = undefined; this.autoFramed = false; this.lastInteraction = performance.now(); });

    // Lighting: a soft studio rig plus coloured rims, then a spotlight that takes over during a lesson.
    this.scene.add(this.hemi);
    this.key.position.set(-3, 8, 5); this.key.castShadow = true; this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 }); this.key.shadow.radius = 6; this.key.shadow.bias = -.0004;
    this.scene.add(this.key);
    const rimViolet = new THREE.DirectionalLight(0xa970ff, 2.4 * LUMA); rimViolet.position.set(-6, 2, -5); this.scene.add(rimViolet);
    const rimCyan = new THREE.DirectionalLight(0x5ce1ff, 1.6 * LUMA); rimCyan.position.set(6, 1.5, -4); this.scene.add(rimCyan);
    this.spot.position.set(0, 9, 4); this.spot.castShadow = true; this.spot.shadow.mapSize.set(1024, 1024); this.spot.shadow.bias = -.0004;
    this.scene.add(this.spot, this.spot.target, this.beam);

    // Floor: catches the shadow and a soft violet pool of light.
    const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.ShadowMaterial({ opacity: .45 }));
    shadowFloor.rotation.x = -Math.PI/2; shadowFloor.position.y = -1.05; shadowFloor.receiveShadow = true;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshBasicMaterial({ map: radialTexture([[0,'rgba(169,112,255,.55)'],[.45,'rgba(110,70,200,.18)'],[1,'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI/2; pool.position.y = -1.04;
    this.scene.add(shadowFloor, pool);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture([[0,'rgba(255,255,255,1)'],[.18,'rgba(214,180,255,.85)'],[.5,'rgba(150,90,255,.25)'],[1,'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.halo.renderOrder = 10; this.scene.add(this.halo);

    this.stage.add(this.model); this.scene.add(this.stage);
    this.buildTemporary();
    if (manifest.asset) this.model.visible = false; // avoid a placeholder flash while the GLB loads

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .6 * LUMA, .45, 2.4 * LUMA);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    let down = { x:0, y:0 };
    const pick = (e: PointerEvent) => {
      const rect = r.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1), this.camera);
      let node: THREE.Object3D | null = ray.intersectObject(this.model, true)[0]?.object ?? null;
      while (node && !node.userData.controlId) node = node.parent;
      return node?.userData.controlId as string | undefined;
    };
    r.domElement.addEventListener('pointerdown', e => down = { x:e.clientX, y:e.clientY });
    r.domElement.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX-down.x, e.clientY-down.y) > 6) return;
      const id = pick(e); if (id) this.select(id);
    });
    r.domElement.addEventListener('pointermove', e => {
      if (e.buttons) return; const id = pick(e);
      if (id !== this.hovered) { this.hovered = id; r.domElement.style.cursor = id ? 'pointer' : 'grab'; }
    });
    r.domElement.addEventListener('pointerleave', () => this.hovered = undefined);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host); this.resize();
    r.setAnimationLoop(() => this.render());
  }

  private material(color: string, roughness=.45) { return new THREE.MeshPhysicalMaterial({ color, roughness, metalness:.05, clearcoat:.6, clearcoatRoughness:.2 }); }
  private box(w:number,h:number,d:number,r:number,color:string) { return new THREE.Mesh(new RoundedBoxGeometry(w,h,d,5,r),this.material(color)); }
  /** Placeholder shown until the GLB arrives, or if it fails to load. */
  private buildTemporary() {
    const shell = this.box(4.65,.5,2.55,.28,'#ece9f4'); shell.position.y=-.12; shell.castShadow=true; this.model.add(shell);
    for (const side of [-1,1]) { const grip = this.box(1.2,.72,2.5,.35,'#dcd8e8'); grip.position.set(side*1.72,-.25,.65); grip.rotation.y=side*-.23; grip.castShadow=true; this.model.add(grip); }
    for (const c of controls) {
      const group = new THREE.Group(); group.name = c.node; group.position.set(...c.position); this.model.add(group);
      const mesh = c.motion==='stick' ? new THREE.Mesh(new THREE.CylinderGeometry(.34,.3,.14,48),this.material('#2a2633'))
        : c.motion==='trigger' || c.id.includes('bumper') ? this.box(.95,.16,.3,.08,'#2a2633')
        : new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.11,40),this.material('#2a2633'));
      mesh.castShadow = true; group.add(mesh);
      // Placeholder groups use world-up presses.
      group.userData.placeholder = true;
    }
    this.scene.updateMatrixWorld(true);
    for (const c of controls) this.register(c.id, this.model.getObjectByName(c.node)!);
  }

  private register(id:string, node:THREE.Object3D) {
    const c = byId.get(id)!; node.userData.controlId = id; this.nodes.set(id, node);
    this.rests.set(id, { position: node.position.clone(), quaternion: node.quaternion.clone() });
    // Each control gets its own material copies so it can glow without lighting its neighbours.
    const glows: THREE.MeshStandardMaterial[] = [];
    node.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true; child.receiveShadow = true;
      const own = (m: THREE.Material) => { const copy = m.clone() as THREE.MeshStandardMaterial; if ('emissive' in copy) { copy.emissive = new THREE.Color(0); copy.emissiveIntensity = 1; glows.push(copy); } return copy; };
      child.material = Array.isArray(child.material) ? child.material.map(own) : own(child.material);
    });
    this.glowMaterials.set(id, glows);
    const label = document.createElement('span'); label.className = 'model-label';
    label.innerHTML = `<b>${c.glyph}</b><em>${c.label === c.glyph ? '' : c.label}</em><i class="hold-bar"></i>`; label.title = c.aliases.join(', ');
    const marker = new CSS2DObject(label); node.add(marker); this.labelNodes.set(id, label);
    const box = new THREE.Box3().setFromObject(node); const centre = box.getCenter(new THREE.Vector3());
    marker.position.copy(node.worldToLocal(centre.add(new THREE.Vector3(0, .28, 0))));
  }

  /** Gloss up the scanned materials: clear lacquer on the shell, satin on rubber. */
  private polish(root: THREE.Object3D) {
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true; o.receiveShadow = true;
      const upgrade = (m: THREE.Material) => {
        if (!(m instanceof THREE.MeshStandardMaterial)) return m;
        const p = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(p, m);
        p.clearcoat = .85; p.clearcoatRoughness = .12; p.envMapIntensity = 1.15;
        p.roughness = Math.min(p.roughness, .55); p.emissiveIntensity = 0; // the scan bakes white into its emissive map; the stage lighting replaces it p.sheen = .15; p.sheenColor = new THREE.Color('#d9c8ff');
        return p;
      };
      o.material = Array.isArray(o.material) ? o.material.map(upgrade) : upgrade(o.material);
    });
  }

  async loadAsset(url:string) {
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.disposed) { disposeTree(gltf.scene); return; }
    // Validate before replacing the placeholder. Artist transforms remain intact.
    const found = controls.map(c => ({ c, node: gltf.scene.getObjectByName(c.node) }));
    const missing = found.filter(x => !x.node).map(x => x.c.node);
    if (missing.length) throw Error(`Model is missing nodes: ${missing.join(', ')}`);
    this.polish(gltf.scene);
    this.stage.remove(this.model); disposeTree(this.model); this.model = gltf.scene; this.stage.add(this.model);
    this.nodes.clear(); this.rests.clear(); this.glowMaterials.clear(); this.labelNodes.clear(); this.motion = undefined;
    this.labels.domElement.replaceChildren();
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    this.stage.position.y = -1.0 - box.min.y + .05;
    this.scene.updateMatrixWorld(true);
    found.forEach(({ c, node }) => this.register(c.id, node!));
    this.highlight(this.selected);
  }

  private worldOf(id: string) { return new THREE.Box3().setFromObject(this.nodes.get(id)!).getCenter(new THREE.Vector3()); }

  showPlaceholder() { this.model.visible = true; }
  view(view:View) {
    this.onView(view); this.lastInteraction = performance.now(); this.autoFramed = false;
    const position = new THREE.Vector3(...manifest.views[view]);
    this.targetLook.set(0, 0, 0);
    if (this.reduced) this.camera.position.copy(position); else this.targetCamera = position;
  }
  /** Dolly towards a control from the angle that shows it best. */
  private frame(id: string) {
    const c = byId.get(id)!; const at = this.worldOf(id); this.onView(c.view); this.lastInteraction = performance.now(); this.autoFramed = true;
    const dir = new THREE.Vector3(...manifest.views[c.view]).normalize();
    const look = at.clone().multiplyScalar(.55);
    const position = look.clone().add(dir.multiplyScalar(c.view === 'front' ? 6.4 : 6.8));
    this.targetLook.copy(look);
    if (this.reduced) { this.camera.position.copy(position); this.orbit.target.copy(look); } else this.targetCamera = position;
  }

  highlight(id?:string) {
    this.selected = id;
    for (const [key, label] of this.labelNodes) label.classList.toggle('active', this.hints && key === id);
    if (id && this.nodes.has(id)) this.frame(id);
  }
  showHints(enabled:boolean) { this.hints = enabled; this.highlight(this.selected); }
  clear() { this.clearDemonstration(); this.view('front'); }

  act(reply:TutorReply) {
    const step = replySteps(reply)[0];
    if (step) this.demonstrate(step, 1100);
  }
  /** Show one tutor step: spotlight and frame the control, then press, hold, squeeze or tilt it. */
  demonstrate(step:TutorStep, durationMs:number) {
    this.highlight(step.controlId); this.resetMotion();
    if (step.action !== 'highlight') void this.animate(step.controlId, step.hold ? 'hold' : step.action, { durationMs, times: step.times, direction: step.direction });
  }
  clearDemonstration() { this.resetMotion(); this.highlight(undefined); }

  animate(id:string, action: string = 'press', options: { durationMs?: number; times?: number; direction?: TutorStep['direction'] } = {}) {
    this.resetMotion();
    const c = byId.get(id)!; const times = options.times ?? 1;
    const kind: MotionKind = action === 'squeeze' || (action === 'press' && c.motion === 'trigger') ? 'squeeze' : action === 'tilt' ? 'tilt' : action === 'hold' ? 'hold' : 'press';
    const natural = (kind === 'hold' ? 1400 : kind === 'squeeze' ? 1300 : kind === 'tilt' ? 1400 : 900) * times;
    // A hold fills the step; other motions keep their natural pace unless the step is shorter.
    const ms = options.durationMs === undefined ? natural : kind === 'hold' ? options.durationMs : Math.min(options.durationMs, natural);
    return new Promise<void>(resolve => { this.motion = { id, kind, start: performance.now(), duration: ms, times, direction: options.direction, flashed: 0, resolve }; });
  }

  /** Release GPU resources, observers and pending animations. The host element is emptied. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.motion?.resolve?.(); this.motion = undefined;
    this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.orbit.dispose();
    disposeTree(this.scene);
    this.scene.environment?.dispose(); this.ringTex.dispose();
    this.composer.dispose(); this.bloom.dispose();
    this.renderer.dispose(); this.host.replaceChildren();
  }

  private resetMotion() {
    if (!this.motion) return;
    const { id, resolve } = this.motion; const node = this.nodes.get(id)!; const rest = this.rests.get(id)!;
    node.position.copy(rest.position); node.quaternion.copy(rest.quaternion);
    this.labelNodes.get(id)?.style.setProperty('--hold', '0');
    this.motion = undefined; this.lastInteraction = performance.now(); resolve?.();
  }

  private ripple(id: string) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: ACCENT_HOT }));
    sprite.position.copy(this.worldOf(id)); sprite.renderOrder = 11; this.scene.add(sprite);
    this.ripples.push({ sprite, start: performance.now() });
  }

  private applyMotion(now: number) {
    const m = this.motion; if (!m) return 0;
    const t = Math.min(1, (now - m.start) / m.duration);
    const node = this.nodes.get(m.id)!, rest = this.rests.get(m.id)!, c = byId.get(m.id)!;
    const cycle = Math.min(m.times - 1, Math.floor(t * m.times)), local = t >= 1 ? 1 : t * m.times - cycle;
    // Envelope: in fast, hold, out. A hold keeps the button down for most of the duration.
    const inEnd = m.kind === 'hold' ? .15 : .35, outStart = m.kind === 'hold' ? .85 : .6;
    const amount = this.reduced ? (local < .7 ? 1 : 0) : local < inEnd ? ease(local / inEnd) : local < outStart ? 1 : 1 - ease((local - outStart) / (1 - outStart));
    node.position.copy(rest.position); node.quaternion.copy(rest.quaternion);
    const placeholder = node.userData.placeholder;
    if (m.kind === 'tilt' && placeholder) node.rotateX(.32 * amount);
    // In the GLB frame (+Z up, +Y forward) "up" tips the stick top towards the shoulders.
    else if (m.kind === 'tilt') { const d = m.direction ?? 'up'; if (d === 'left' || d === 'right') node.rotateY((d === 'right' ? .32 : -.32) * amount); else node.rotateX((d === 'up' ? -.32 : .32) * amount); }
    else if (c.movement.rotation) node.rotateOnAxis(new THREE.Vector3(1,0,0), c.movement.range * amount);
    else if (placeholder) node.translateY(-.075 * amount);
    else { const axis = new THREE.Vector3(c.movement.axis === 'x' ? 1 : 0, c.movement.axis === 'y' ? 1 : 0, c.movement.axis === 'z' ? 1 : 0); node.translateOnAxis(axis, c.movement.range * amount); }
    if (m.flashed <= cycle && amount > .97) { m.flashed = cycle + 1; this.ripple(m.id); }
    if (m.kind === 'hold' || m.kind === 'squeeze') this.labelNodes.get(m.id)?.style.setProperty('--hold', String(Math.min(1, local / outStart)));
    if (t >= 1) this.resetMotion();
    return amount;
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h); this.composer?.setSize(w, h); this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // Below 5:4 keep the horizontal field fixed so narrow (phone) stages still fit the whole controller.
    const minAspect = 1.25, tanHalf = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
    this.camera.fov = this.camera.aspect >= minAspect ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf * minAspect / this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  private render() {
    const now = performance.now(); const dt = Math.min((now - this.lastFrame) / 1000, .05); this.lastFrame = now; const time = now / 1000;
    if (this.targetCamera) {
      const k = 1 - Math.pow(.0012, dt);
      this.orbit.target.lerp(this.targetLook, k);
      const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.orbit.target));
      const to = new THREE.Spherical().setFromVector3(this.targetCamera.clone().sub(this.targetLook));
      let dTheta = to.theta - from.theta; if (dTheta > Math.PI) dTheta -= Math.PI * 2; if (dTheta < -Math.PI) dTheta += Math.PI * 2;
      from.theta += dTheta * k; from.phi += (to.phi - from.phi) * k; from.radius += (to.radius - from.radius) * k;
      this.camera.position.setFromSpherical(from).add(this.orbit.target);
      if (this.camera.position.distanceTo(this.targetCamera) < .01) this.targetCamera = undefined;
    }
    const pressed = this.applyMotion(now);

    // Lighting crossfade: the stage dims and the spotlight finds the selected control.
    const wantFocus = this.selected && this.hints ? 1 : 0;
    this.focus += (wantFocus - this.focus) * (1 - Math.pow(.004, dt));
    this.scene.environmentIntensity = THREE.MathUtils.lerp(.55, .16, this.focus) * LUMA;
    this.hemi.intensity = THREE.MathUtils.lerp(.5, .1, this.focus) * LUMA;
    this.key.intensity = THREE.MathUtils.lerp(1.8, .35, this.focus) * LUMA;
    this.spot.intensity = 95 * this.focus * LUMA;
    const beamMat = this.beam.material as THREE.ShaderMaterial;
    if (this.selected && this.nodes.has(this.selected)) {
      const at = this.worldOf(this.selected);
      this.spot.target.position.lerp(at, 1 - Math.pow(.001, dt));
      const from = at.clone().add(new THREE.Vector3(at.x * .4, 7.5, (byId.get(this.selected)!.view === 'front' ? 3.2 : -3.2)));
      this.spot.position.lerp(from, 1 - Math.pow(.001, dt));
      this.halo.position.copy(at);
    }
    // The shaft runs from the lamp to the control.
    const len = this.spot.position.distanceTo(this.spot.target.position);
    this.beam.position.copy(this.spot.position); this.beam.lookAt(this.spot.target.position);
    this.beam.scale.set(len * .12, len * .12, len);
    beamMat.uniforms.opacity.value = this.focus * (this.reduced ? .6 : .55 + .1 * Math.sin(time * 2)) * LUMA;

    // Glow: pulse on the selected control, a flash at the bottom of each press, a hint on hover.
    const pulse = this.reduced ? .7 : .55 + .45 * Math.sin(time * 4);
    for (const [id, mats] of this.glowMaterials) {
      const isSel = this.hints && id === this.selected, isHover = id === this.hovered;
      const intensity = isSel ? 3 + 2.5 * pulse + (this.motion?.id === id ? 7 * pressed : 0) : isHover ? .8 : 0;
      for (const mat of mats) { mat.emissive.copy(this.motion?.id === id && pressed > .9 ? ACCENT_HOT : ACCENT); mat.emissiveIntensity = intensity * LUMA; }
    }
    const haloMat = this.halo.material as THREE.SpriteMaterial;
    haloMat.opacity = this.focus * (.55 + .25 * pulse + .4 * pressed) * LUMA;
    const s = .85 + .15 * pulse + .35 * pressed; this.halo.scale.set(s, s, s);

    for (const r of [...this.ripples]) {
      const k = (now - r.start) / 700;
      if (k >= 1) { this.scene.remove(r.sprite); r.sprite.material.dispose(); this.ripples.splice(this.ripples.indexOf(r), 1); continue; }
      const size = .3 + 1.5 * ease(k); r.sprite.scale.set(size, size, size); r.sprite.material.opacity = 1 - k;
    }

    // At rest the controller stays still. Once an answer has finished, ease back to the flat front view.
    if (this.autoFramed && !this.motion && now - this.lastInteraction > SETTLE_MS) this.view('front');

    this.orbit.update(dt);
    this.composer.render(dt);
    this.labels.render(this.scene, this.camera);
  }
}
