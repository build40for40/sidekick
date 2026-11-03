import './style.css';
import { ControllerScene } from './controller/scene';
import { controls, byId, manifest } from './controller/manifest';
import { PhysicalInput } from './controller/gamepad';
import { transitionLesson, type Lesson, type InputSource, type LessonKind } from './tutor/lesson';
import { VoiceOrchestrator } from './voice/orchestrator';
import { capabilities, loadLocal, type LocalRuntime } from './voice/local';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header><a class="wordmark" href="./" aria-label="Sidekick home"><span class="brand-icon">✳</span> sidekick<span class="beta">EARLY ACCESS</span></a><span class="private"><span class="dot"></span> On your device. In your corner.</span></header>
<main><section class="intro"><div><p class="eyebrow">A LITTLE HELP. A WHOLE NEW WORLD.</p><h1>Make yourself<br>a player<span>.</span></h1></div><p class="intro-copy">New to controllers? You’re in the right place.<br>Ask a question. Get to know the buttons.<br>Go at your own pace.</p></section>
<div class="workspace"><section class="explorer" aria-label="Controller explorer"><div class="panel-top"><span><span class="dot"></span> YOUR CONTROLLER</span><span class="asset-tag">TEMPORARY 3D MODEL</span></div><div id="scene"></div><div class="view-controls" role="group" aria-label="Camera views"><button data-view="front" class="selected">Front</button><button data-view="shoulders">Shoulders</button><button data-view="rear">Back</button></div><div class="explorer-footer"><span>↔ Drag to look around <span class="separator">·</span> Click a control to explore</span><button id="reset" class="text-button">Reset view ↗</button></div></section>
<section class="tutor" aria-label="Voice tutor"><div class="panel-top"><span>MEET YOUR SIDEKICK</span><span id="mode" class="fixture-tag">DEVELOPMENT TUTOR</span></div><div class="tutor-face" aria-hidden="true"><span></span><span></span><i></i></div><p class="tutor-heading">Let’s get comfortable.</p><p id="reply" aria-live="polite">Every button is a new possibility. Ask me where one is, or pick something to explore.</p><div class="status-row"><span class="dot"></span><span id="status" role="status">Ready · text exploration</span></div><button id="talk" class="talk" aria-label="Start recording" disabled><span aria-hidden="true">♩</span> <span id="talk-label">Talk to Sidekick</span></button><p id="voice-note" class="small centered">Enable local voice below to use your microphone.</p><div class="speech-tools"><button id="repeat" disabled>↻ Repeat</button><button id="stop">◼ Stop</button><label><input id="captions" type="checkbox" checked> Captions</label></div><p id="transcript" class="transcript" aria-live="polite"></p><form id="text-form"><label for="question" class="sr-only">Type a question</label><input id="question" placeholder="Or type a question…" maxlength="1200" autocomplete="off"><button aria-label="Send question">↑</button></form><div class="suggestions"><button data-question="Where is the right bumper?">Where’s the right bumper? ↗</button><button data-question="What does clicking the stick mean?">What does clicking a stick mean? ↗</button></div></section></div>
<section class="below"><div class="practice"><p class="eyebrow">SMALL STEPS, BIG CONFIDENCE</p><h2>A little practice goes a long way.</h2><div class="lesson-buttons"><button data-lesson="find"><b>01</b><span>Find a control<small>Start with the A button</small></span><span>↗</span></button><button data-lesson="click"><b>02</b><span>Click a stick<small>Discover a hidden button</small></span><span>↗</span></button><button data-lesson="practise"><b>03</b><span>Try it yourself<small>Find the right bumper</small></span><span>↗</span></button></div><div class="lesson-state"><p id="lesson-status" role="status">No pressure. Pick a practice when you’re ready.</p><label><input id="hints" type="checkbox" checked> Show hints</label></div></div><aside class="setup"><div class="setup-title"><span>↓</span><h2>Your voice. Your device.</h2></div><p>Download the local models once to talk. Your audio and questions stay in this browser. Model downloads may be large and take several minutes.</p><button id="download">Enable local voice <span>↓</span></button><progress id="progress" max="100" hidden></progress><p id="download-status" role="status" class="small">Whisper + Qwen 1.5B + Kokoro · desktop Chrome + WebGPU</p></aside></section>
<details class="control-directory"><summary>Explore all controls <span>Keyboard-friendly control list</span></summary><div id="control-list"></div></details><div class="physical"><label><input id="physical" type="checkbox"> Use a physical controller (optional)</label><p id="gamepad-status">No physical controller is needed.</p></div>
<footer><span class="wordmark">✳ sidekick</span><span>A more welcoming way to play.</span><span>Scaffold v0.1 · English · Xbox-style reference</span></footer></main>`;
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const reply=el('reply'), transcript=el('transcript'), status=el('status'), talk=el<HTMLButtonElement>('talk'), question=el<HTMLInputElement>('question');
let lesson:Lesson|null=null;
let runtime:LocalRuntime|undefined;
let downloadPending=false;
let scene:ControllerScene|undefined;
let busy=false;
const say=(text:string)=> { reply.textContent=text; };
function updateLesson() {
  const line=el('lesson-status');
  if(!lesson) return;
  const c=byId.get(lesson.target)!;
  line.textContent=lesson.complete ? lesson.source==='physical' ? `Physical input confirmed: ${c.label} was pressed.` : `You found ${c.label} on screen. That confirms virtual recognition.` : `${lesson.kind==='click'?'Click':'Find'} ${c.label} on the 3D controller or in the control list.${lesson.hints?' Follow the outline.':''}`;
  scene?.showHints(lesson.hints);
  if(lesson.hints && !lesson.complete) scene?.highlight(lesson.target);
}
function select(id:string,source:InputSource='virtual') {
  if(busy) return;
  const c=byId.get(id)!;
  scene?.highlight(id); scene?.animate(id,c.motion==='trigger'?'squeeze':'press');
  lesson=transitionLesson(lesson,{type:'input',controlId:id,source});
  updateLesson();
  say(lesson && !lesson.complete && lesson.target!==id ? `That’s ${c.label}. Try ${byId.get(lesson.target)!.label}.` : c.description);
}
try { scene=new ControllerScene(el('scene'),id=>select(id)); if(manifest.asset) void scene.loadAsset(manifest.asset).catch(e=>say(`Asset could not load: ${e.message}`)); }
catch { el('scene').innerHTML='<p class="render-error">3D rendering is unavailable. Try enabling hardware acceleration. You can still use the control list below.</p>'; }
const voice=new VoiceOrchestrator(event=> {
  if(event.type==='phase') {
    busy=['listening','transcribing','thinking','speaking'].includes(event.phase);
    status.textContent=event.phase==='ready' ? runtime?'Ready · local voice':'Ready · text exploration' : event.phase==='speaking'?'Speaking · preparing or playing audio':event.phase.charAt(0).toUpperCase()+event.phase.slice(1);
    talk.classList.toggle('listening',event.phase==='listening');
    el('talk-label').textContent=event.phase==='listening'?'Finish recording':'Talk to Sidekick';
    talk.setAttribute('aria-label',event.phase==='listening'?'Finish recording':'Start recording');
    talk.setAttribute('aria-pressed',String(event.phase==='listening'));
  } else if(event.type==='reply') {
    say(event.reply.spoken); scene?.act(event.reply);
    if(event.reply.exercise && event.reply.controlId) { lesson=transitionLesson(lesson,{type:'start',kind:event.reply.exercise,target:event.reply.controlId}); el<HTMLInputElement>('hints').checked=true; updateLesson(); }
  } else if(event.type==='error') say(event.message);
  else if(event.type==='transcript') transcript.textContent=`You: ${event.text}`;
  else if(event.type==='timing') { console.info('[Sidekick local timing, milliseconds; firstAudible is scheduling estimate]',event.timings); }
});
function ask(text:string) { if(downloadPending) return; voice.ask(text); }
el('text-form').addEventListener('submit',e=>{e.preventDefault(); ask(question.value); question.value='';});
app.querySelectorAll<HTMLButtonElement>('[data-question]').forEach(button=>button.onclick=()=>ask(button.dataset.question!));
talk.onclick=()=>{ if(voice.phase==='listening') voice.finishRecording(); else void voice.startRecording(); };
el('stop').onclick=()=>voice.stop(); el('repeat').onclick=()=>voice.repeat();
el<HTMLInputElement>('captions').onchange=e=>{ const enabled=(e.target as HTMLInputElement).checked; reply.hidden=!enabled; transcript.hidden=!enabled; };
app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>{scene?.view(button.dataset.view as 'front'); app.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b===button));});
el('reset').onclick=()=>scene?.view('front');
for(const c of controls) { const button=document.createElement('button'); button.textContent=`${c.label} · ${c.id.replaceAll('-',' ')}`; button.onclick=()=>select(c.id); el('control-list').append(button); }
app.querySelectorAll<HTMLButtonElement>('[data-lesson]').forEach(button=>button.onclick=()=> {
  voice.stop(); const kind=button.dataset.lesson as LessonKind;
  const target=kind==='find'?'a':kind==='click'?'left-stick':'right-bumper';
  lesson=transitionLesson(lesson,{type:'start',kind,target}); el<HTMLInputElement>('hints').checked=true;
  updateLesson(); scene?.highlight(target);
  say(kind==='click'?'Clicking means pushing a stick straight down like a button. Click the left stick on screen to practise.':`Find ${byId.get(target)!.label}. You can turn hints off when you’re ready.`);
  if(kind==='click') scene?.animate(target);
});
el<HTMLInputElement>('hints').onchange=e=>{lesson=transitionLesson(lesson,{type:'hints',enabled:(e.target as HTMLInputElement).checked}); updateLesson();};
const physical=new PhysicalInput(id=>select(id,'physical'),message=>el('gamepad-status').textContent=message);
el<HTMLInputElement>('physical').onchange=e=>{ if((e.target as HTMLInputElement).checked) physical.start(); else { physical.stop(); el('gamepad-status').textContent='Physical input is off. Virtual practice is ready.'; } };
el<HTMLButtonElement>('download').onclick=async()=> {
  if(downloadPending || runtime) return;
  voice.beginDownload(); voice.unlockAudio();
  const button=el<HTMLButtonElement>('download'), detail=el('download-status'), progress=el<HTMLProgressElement>('progress');
  downloadPending=true; button.disabled=true;
  try {
    const unsupported=await capabilities(); if(unsupported) throw Error(unsupported);
    status.textContent='Downloading'; detail.textContent='Starting local model download…'; progress.hidden=false; progress.removeAttribute('value');
    runtime=await loadLocal(p=>{detail.textContent=p.stage; if(p.progress===undefined) progress.removeAttribute('value'); else progress.value=p.progress;});
    voice.adapters=runtime.adapters; el('mode').textContent='LOCAL VOICE'; el('mode').className='local-tag';
    talk.disabled=false; el<HTMLButtonElement>('repeat').disabled=false; button.textContent='Local voice ready ✓'; detail.textContent='Models loaded. Cached assets will be reused when available.';
    el('voice-note').textContent='Click to talk. Click again when you’re done. Up to 30 seconds.';
    voice.finishDownload();
  } catch(error) {
    detail.textContent=`${error instanceof Error?error.message:String(error)} Download failed; text exploration is available. Retry when ready.`;
    voice.downloadFailed(Error('Local voice could not load. Check the download status below, then retry.')); button.disabled=false; button.textContent='Retry local voice download ↻';
  } finally { progress.hidden=true; downloadPending=false; }
};
window.addEventListener('pagehide',()=>{ voice.stop(); runtime?.dispose(); physical.stop(); });
