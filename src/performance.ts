import { loadLocal, type LocalRuntime } from './voice/local';
import { tutorModels, type VoicePerformanceOptions } from './voice/config';
import cases from '../evaluation/cases.json';
import cookingGold from '../knowledge/games/overcooked2/expected-answers.json';
import shootingGold from '../knowledge/games/fortnite/expected-answers.json';
import { replySteps } from './tutor/schema';
import { speechSentences, trimSilence } from './voice/audio';
const find = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const load = find<HTMLButtonElement>('load'), run = find<HTMLButtonElement>('run'), save = find<HTMLButtonElement>('save');
const status = find('status'), output = find('results');
let runtime: LocalRuntime | undefined;
const rows: object[] = [];
let environment: object;
load.onclick = async () => {
  load.disabled = run.disabled = save.disabled = true; runtime?.dispose(); runtime = undefined;
  try {
    const performance: VoicePerformanceOptions = { tutor: find<HTMLSelectElement>('tutor').value as keyof typeof tutorModels, audioBackend: find<HTMLSelectElement>('backend').value as 'auto' | 'wasm' };
    const started = performanceNow();
    runtime = await loadLocal(p => { status.textContent = `${p.stage} ${p.progress === undefined ? '' : Math.round(p.progress)+'%'}`; }, undefined, null, performance);
    const gpu = await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; device?: string; description?: string } } | null> } }).gpu?.requestAdapter();
    const info = gpu?.info;
    environment = { browser: navigator.userAgent, gpu: info && { vendor:info.vendor, architecture:info.architecture, device:info.device, description:info.description }, isolated: crossOriginIsolated, cores: navigator.hardwareConcurrency, runtime: runtime.adapters.info, setupMs: performanceNow()-started, cache: 'Browser-managed; record cold/warm state manually' };
    find('environment').textContent = JSON.stringify(environment,null,2);
    rows.length = 0; output.textContent = ''; status.textContent = 'Ready. Run records first and repeated calls separately.'; run.disabled = false;
  } catch (error) { status.textContent = String(error); }
  finally { load.disabled = false; }
};
const performanceNow = () => globalThis.performance.now();
run.onclick = async () => {
  if (!runtime) return;
  run.disabled = load.disabled = true;
  const { adapters } = runtime;
  const suite = find<HTMLSelectElement>('suite').value;
  const quick = suite === 'quick', repeats = quick ? 1 : 5;
  const record = (row: object) => { rows.push(row); output.textContent = JSON.stringify(rows,null,2); save.disabled = false; };
  try {
    // Fixed synthetic speech provides reproducible ASR input without microphone access.
    const phrase = 'Where is the right bumper?';
    for (let repeat = 0; repeat < repeats; repeat++) {
      status.textContent = `Synthetic audio pass ${repeat+1}/${repeats}`;
      const start = performanceNow(), audio = await adapters.synthesis.synthesize(phrase, { cache:false }), synthesisMs = performanceNow()-start;
      const offline = new OfflineAudioContext(1, Math.ceil(audio.pcm.length/audio.sampleRate*16000),16000);
      const buffer = offline.createBuffer(1,audio.pcm.length,audio.sampleRate); buffer.copyToChannel(new Float32Array(audio.pcm),0);
      const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
      const pcm = trimSilence((await offline.startRendering()).getChannelData(0)), seconds = pcm.length/16000;
      const t = performanceNow(), transcript = await adapters.recognition.transcribe(pcm);
      record({ kind:'synthetic audio, not microphone', repeat, phrase, transcript, seconds, transcriptionMs:performanceNow()-t, synthesisMs, synthesisCache:'disabled for inference comparison' });
    }
    const prompts = [
      ...cases.map(c => ({ question: c.prompt, game: null, expected: 'controlId' in c ? c.controlId : undefined, criteria: c.criteria })),
      ...cookingGold.answers.map(c => ({ question:c.question, game:'overcooked2', expected:c.reply, criteria:'Compare with supplied gold; review wording manually' })),
      ...shootingGold.answers.map(c => ({ question:c.question, game:'fortnite', expected:c.reply, criteria:'Compare with supplied gold; review wording manually' })),
    ];
    const selected = suite === 'audio' ? [] : quick ? [prompts[0], prompts[1], prompts[cases.length], prompts[cases.length + 2], prompts[prompts.length - 1]] : prompts;
    for (let pass = 0; pass < repeats; pass++) for (const [index, item] of selected.entries()) {
      status.textContent = `Tutor pass ${pass+1}/${repeats}, question ${index+1}/${prompts.length}`;
      runtime.setGame(item.game); // Independent cases, no answer leakage from previous questions.
      const start = performanceNow();
      try {
        const reply = await adapters.tutor.reply(item.question), generationMs = performanceNow()-start;
        const sentence = speechSentences(reply.spoken)[0], t = performanceNow();
        await adapters.synthesis.synthesize(sentence, { cache:false });
        record({ kind:'typed model evaluation, scheduled playback not measured', pass, ...item, reply, steps:replySteps(reply), generationMs, firstSentenceSynthesisMs:performanceNow()-t, stats:adapters.tutor.stats?.(), semanticVerdict:'Needs human review' });
      } catch (error) { record({ pass,...item,error:String(error),elapsedMs:performanceNow()-start }); }
    }
    status.textContent = 'Suite complete. Inspect validation failures and review semantic quality before choosing a model.';
  } catch (error) { status.textContent = String(error); }
  finally { run.disabled = load.disabled = false; }
};
save.onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ environment, rows }, null, 2)], { type:'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'sidekick-local-performance.json'; a.click(); URL.revokeObjectURL(url);
};
window.addEventListener('pagehide', () => runtime?.dispose());
