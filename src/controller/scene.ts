import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { manifest, controls, byId, type View } from './manifest';
import { replySteps, type TutorReply, type TutorStep } from '../tutor/schema';
interface Rest { position: THREE.Vector3; rotation: THREE.Euler }
export class ControllerScene {
  private resizeObserver: ResizeObserver;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36,1,.1,80);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private labels = new CSS2DRenderer();
  private orbit: OrbitControls;
  private model = new THREE.Group();
  private nodes = new Map<string, THREE.Object3D>();
  private rests = new Map<string, Rest>();
  private outlines = new Map<string, THREE.LineSegments[]>();
  private labelNodes = new Map<string, HTMLElement>();
  private animation?: { id: string; start: number; action: string; duration: number; hold?: boolean; times?: number; direction?: TutorStep['direction'] };
  private targetCamera?: THREE.Vector3;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private selected?: string;
  private hints = true;
  constructor(private host: HTMLElement, private select: (id:string)=>void, private onView: (view:View)=>void = ()=>{}) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; this.renderer.setClearColor(0,0);
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D reference controller. Drag to orbit. Select a control or use Tab to reach the keyboard controls.');
    this.host.append(this.renderer.domElement);
    Object.assign(this.labels.domElement.style, { position:'absolute', inset:'0', pointerEvents:'none' }); this.host.append(this.labels.domElement);
    this.camera.position.set(...manifest.views.front);
    this.orbit = new OrbitControls(this.camera,this.renderer.domElement); this.orbit.enableDamping = !this.reduced; this.orbit.minDistance = 4; this.orbit.maxDistance = 13; this.orbit.target.set(0,0,0); this.orbit.enablePan = false;
    this.orbit.addEventListener('start',()=>this.targetCamera = undefined);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x595b53,3));
    const key = new THREE.DirectionalLight(0xffffff,5); key.position.set(-3,7,4); key.castShadow = true; key.shadow.mapSize.set(2048,2048); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc5e5cc,3); rim.position.set(2,3,-4); this.scene.add(rim);
    this.scene.add(this.model);
    this.buildTemporary();
    let down = {x:0,y:0};
    this.renderer.domElement.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
    this.renderer.domElement.addEventListener('pointerup',e=> {
      if (Math.hypot(e.clientX-down.x,e.clientY-down.y)>6) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);
      const hits = ray.intersectObject(this.model,true);
      if (!hits.length) return;
      let node: THREE.Object3D | null = hits[0].object;
      while (node && !node.userData.controlId) node = node.parent;
      if (node?.userData.controlId) this.select(node.userData.controlId);
    });
    this.resizeObserver = new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(host); this.resize();
    this.renderer.setAnimationLoop(()=>this.render());
  }
  private material(color: string, roughness=.6) { return new THREE.MeshStandardMaterial({ color, roughness, metalness:.13 }); }
  private box(w:number,h:number,d:number,r:number,color:string) { return new THREE.Mesh(new RoundedBoxGeometry(w,h,d,5,r),this.material(color)); }
  private buildTemporary() {
    const shell = this.box(4.65,.5,2.55,.28,'#e9e9df'); shell.position.y=-.12; shell.castShadow=true; shell.receiveShadow=true; this.model.add(shell);
    for (const side of [-1,1]) {
      const grip = this.box(1.2,.72,2.5,.35,'#d4d6cb'); grip.position.set(side*1.72,-.25,.65); grip.rotation.y=side*-.23; grip.castShadow=true; this.model.add(grip);
      const inset = this.box(.85,.12,1.7,.12,'#343c36'); inset.position.set(side*1.79,-.57,.91); inset.rotation.y=side*-.23; this.model.add(inset);
    }
    const centre = new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.045,40),this.material('#68765c')); centre.position.set(0,.18,-.62); this.model.add(centre);
    for (const c of controls) {
      const group = new THREE.Group(); group.name = c.node; group.position.set(...c.position); this.model.add(group);
      let mesh: THREE.Mesh;
      if (c.motion === 'stick') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(.34,.3,.14,48),this.material('#303730'));
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.06,48),this.material('#686f62')); socket.position.set(c.position[0],.2,c.position[2]); this.model.add(socket);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.26,.018,8,40),this.material('#616c5a')); ring.rotation.x=Math.PI/2; ring.position.y=.08; group.add(ring);
      } else if (c.id.startsWith('dpad')) mesh=this.box(.26,.1,.26,.04,'#333c33');
      else if (c.motion==='trigger' || ['l1','r1'].includes(c.id)) mesh=this.box(.95,.16,.3,.08,'#303a31');
      else if (c.id==='touchpad') mesh=this.box(1.3,.12,.65,.08,'#303a31');
      else mesh=new THREE.Mesh(new THREE.CylinderGeometry(['cross','circle','square','triangle'].includes(c.id)?.23:.15,['cross','circle','square','triangle'].includes(c.id)?.23:.15,.11,40),this.material('#303a31'));
      mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
      this.register(c.id,group);
    }
  }
  private register(id:string,node:THREE.Object3D) {
    const c=byId.get(id)!; node.userData.controlId=id; this.nodes.set(id,node);
    this.rests.set(id,{position:node.position.clone(),rotation:node.rotation.clone()});
    const lines: THREE.LineSegments[]=[];
    node.traverse(child=> { if(child instanceof THREE.Mesh) {
      const outline=new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry,35),new THREE.LineBasicMaterial({ color:'#dde693', transparent:true, opacity:1 })); outline.visible=false; child.add(outline); lines.push(outline);
    }}); this.outlines.set(id,lines);
    const label=document.createElement('span'); label.className='model-label'; label.textContent=c.label; label.title=c.aliases.join(', ');
    const marker=new CSS2DObject(label); marker.position.y=.17; node.add(marker); this.labelNodes.set(id,label);
  }
  async loadAsset(url:string) {
    const gltf=await new GLTFLoader().loadAsync(url);
    // Validate before replacing placeholder. Artist transforms remain intact.
    const found=controls.map(c=>({c,node:gltf.scene.getObjectByName(c.node)}));
    const missing=found.filter(x=>!x.node).map(x=>x.c.node);
    if(missing.length) throw Error(`Model is missing nodes: ${missing.join(', ')}`);
    this.scene.remove(this.model); this.model=gltf.scene; this.scene.add(this.model);
    this.nodes.clear(); this.rests.clear(); this.outlines.clear(); this.labelNodes.clear();
    found.forEach(({c,node})=>this.register(c.id,node!));
  }
  view(view:View) { this.onView(view); const position=new THREE.Vector3(...manifest.views[view]); if(this.reduced) this.camera.position.copy(position); else this.targetCamera=position; }
  highlight(id?:string) {
    this.selected=id;
    for(const [key,lines] of this.outlines) lines.forEach(l=>l.visible=this.hints && key===id);
    for(const [key,label] of this.labelNodes) label.classList.toggle('active',this.hints && key===id);
    if(id) this.view(byId.get(id)!.view);
  }
  showHints(enabled:boolean) { this.hints=enabled; const selected=this.selected; this.highlight(selected); }
  act(reply:TutorReply) {
    const step=replySteps(reply)[0];
    if(step) this.demonstrate(step,1100);
  }
  demonstrate(step:TutorStep,durationMs:number) { this.highlight(step.controlId); this.resetMotion(); if(step.action!=='highlight') this.animate(step.controlId,step.action,{...step,durationMs}); }
  clearDemonstration() { this.resetMotion(); this.highlight(); }
  animate(id:string, action='press', options: { durationMs?: number; hold?: boolean; times?: number; direction?: TutorStep['direction'] } = {}) {
    this.resetMotion(); this.animation={id,start:performance.now(),action,duration:options.durationMs ?? 1100,hold:options.hold,times:options.times,direction:options.direction};
  }
  private resetMotion() {
    if(!this.animation) return;
    const node=this.nodes.get(this.animation.id)!; const rest=this.rests.get(this.animation.id)!;
    node.position.copy(rest.position); node.rotation.copy(rest.rotation); this.animation=undefined;
  }
  dispose() {
    this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.orbit.dispose();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    this.renderer.dispose(); this.host.replaceChildren();
  }
  private resize() { const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight); this.renderer.setSize(w,h); this.labels.setSize(w,h); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  private render() {
    if(this.targetCamera) { this.camera.position.lerp(this.targetCamera,.06); if(this.camera.position.distanceTo(this.targetCamera)<.01) this.targetCamera=undefined; }
    if(this.animation) {
      const {id,start,action,duration,hold,times=1,direction}=this.animation; const t=(performance.now()-start)/duration;
      if(t>=1) this.resetMotion(); else {
        const node=this.nodes.get(id)!, rest=this.rests.get(id)!;
        // Reduced motion retains the highlight but leaves the artist's transforms intact.
        const cycle=(t*times)%1;
        const amount=this.reduced ? 0 : hold ? Math.min(cycle/.15,1,(1-cycle)/.15) : Math.sin(Math.PI*cycle);
        node.position.copy(rest.position); node.rotation.copy(rest.rotation);
        if(action==='tilt') {
          const axis=new THREE.Vector3(direction==='up'||direction==='down'?1:0,0,direction==='up'||direction==='down'?0:1);
          node.rotateOnAxis(axis,amount*.35*(direction==='right'||direction==='down'?-1:1));
        }
        else {
          const movement=byId.get(id)!.movement;
          const axis=new THREE.Vector3(movement.axis==='x'?1:0,movement.axis==='y'?1:0,0);
          if(movement.rotation) node.rotateOnAxis(axis,movement.range*amount);
          else node.translateOnAxis(axis,movement.range*amount);
        }
      }
    }
    this.orbit.update(); this.renderer.render(this.scene,this.camera); this.labels.render(this.scene,this.camera);
  }
}
