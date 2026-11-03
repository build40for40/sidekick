import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceOrchestrator } from '../src/voice/orchestrator';
import type { VoiceEvent, VoiceAdapters } from '../src/voice/types';
const flush=async()=>{ for(let i=0;i<20;i++) await Promise.resolve(); };
function deferred<T>() { let resolve!:(x:T)=>void; const promise=new Promise<T>(r=>resolve=r); return {promise,resolve}; }
let plays=0, stops=0;
let sources: { onended: (() => void) | null }[] = [];
class FakeAudioContext {
  state='running'; baseLatency=0;
  resume(){return Promise.resolve();}
  createBuffer(){return {copyToChannel(){}};}
  close(){return Promise.resolve();}
  createBufferSource(){const source={buffer:null,onended:null as (() => void) | null,connect(){},start(){plays++;},stop(){stops++;}};sources.push(source);return source;}
}
function adapters():VoiceAdapters {return {
  recognition:{transcribe:vi.fn(async()=> 'Where is A?')},
  tutor:{reply:vi.fn(async()=>({spoken:'Here is A.',action:'highlight' as const,controlId:'cross'})),interrupt:vi.fn()},
  synthesis:{synthesize:vi.fn(async()=>({pcm:new Float32Array(10),sampleRate:24000}))},
};}
beforeEach(()=>{plays=0;stops=0;sources=[];vi.stubGlobal('AudioContext',FakeAudioContext);});
afterEach(()=>vi.unstubAllGlobals());
describe('turn orchestration',()=> {
  it('narrates the introduction and each step in order, cueing only when that audio starts',async()=> {
    const events:VoiceEvent[]=[];const voice=new VoiceOrchestrator(e=>events.push(e));const a=adapters();voice.adapters=a;
    const steps=[{action:'press' as const,controlId:'cross',say:'Put it down.'},{action:'press' as const,controlId:'square',say:'Chop it.'}];
    vi.mocked(a.tutor.reply).mockResolvedValue({spoken:'Here are the steps.',found:true,actionId:'chop',steps,jargon:null});
    voice.ask('How do I chop it?');await flush();
    expect(a.synthesis.synthesize).toHaveBeenCalledTimes(2);expect(events.filter(e=>e.type==='step')).toHaveLength(0);
    sources[0].onended!();await flush();expect(a.synthesis.synthesize).toHaveBeenNthCalledWith(2,'Put it down.');
    expect(events.filter(e=>e.type==='step')).toMatchObject([{index:0,step:steps[0]}]);
    sources[1].onended!();await flush();expect(a.synthesis.synthesize).toHaveBeenNthCalledWith(3,'Chop it.');
    sources[2].onended!();await flush();expect(voice.phase).toBe('ready');
    expect(events.filter(e=>e.type==='demonstration')).toEqual([{type:'demonstration',steps,completedPasses:1}]);
    voice.repeat();await flush();expect(a.synthesis.synthesize).toHaveBeenNthCalledWith(4,'Here are the steps.');
    voice.stop();await flush();expect(voice.phase).toBe('ready');
  });
  it('cancels the rest of a spoken sequence and releases the queue for the next question',async()=> {
    const events:VoiceEvent[]=[];const voice=new VoiceOrchestrator(e=>events.push(e));const a=adapters();voice.adapters=a;
    vi.mocked(a.tutor.reply).mockResolvedValueOnce({spoken:'Start.',found:true,actionId:null,steps:[{action:'press',controlId:'left-stick',say:'Click it.'}],jargon:null});
    voice.ask('old');await flush();voice.ask('new');await flush();
    expect(a.synthesis.synthesize).toHaveBeenCalledTimes(3);
    // The old instruction may be prefetched, but it must never play or cue an animation.
    expect(a.synthesis.synthesize).toHaveBeenCalledWith('Click it.');expect(plays).toBe(2);
    expect(events.filter(e=>e.type==='step')).toHaveLength(0);voice.stop();
  });
  it('ignores a stale generation after a new question',async()=> {
    const events:VoiceEvent[]=[];const voice=new VoiceOrchestrator(e=>events.push(e));const a=adapters();voice.adapters=a;
    const delayed=deferred<any>();vi.mocked(a.tutor.reply).mockImplementationOnce(()=>delayed.promise);
    voice.ask('old');await flush();voice.ask('new');delayed.resolve({spoken:'Stale.',action:'press',controlId:'circle'});await flush();
    expect(events.filter(e=>e.type==='reply')).toEqual([{type:'reply',reply:{spoken:'Here is A.',action:'highlight',controlId:'cross'}}]);expect(plays).toBe(1);
  });
  it('never plays stale synthesis and stops active playback',async()=> {
    const voice=new VoiceOrchestrator(()=>{});const a=adapters();voice.adapters=a;
    const delayed=deferred<any>();vi.mocked(a.synthesis.synthesize).mockImplementationOnce(()=>delayed.promise);
    voice.ask('old');await flush();voice.stop();delayed.resolve({pcm:new Float32Array(10),sampleRate:24000});await flush();expect(plays).toBe(0);
    voice.ask('new');await flush();expect(plays).toBe(1);voice.stop();expect(stops).toBe(1);
  });
  it('handles denial then recovers through text',async()=> {
    const events:VoiceEvent[]=[];const voice=new VoiceOrchestrator(e=>events.push(e));voice.adapters=adapters();
    vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockRejectedValue(new DOMException('denied','NotAllowedError'))}});
    await voice.startRecording();expect(voice.phase).toBe('error');expect(events.some(e=>e.type==='error'&&e.message.includes('permission was denied'))).toBe(true);
    voice.ask('Where is A?');await flush();expect(plays).toBe(1);
  });
  it('releases a stream granted after cancellation',async()=> {
    const voice=new VoiceOrchestrator(()=>{});voice.adapters=adapters();const permission=deferred<any>();const stop=vi.fn();
    vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>permission.promise}});
    const recording=voice.startRecording();voice.stop();permission.resolve({getTracks:()=>[{stop}]});await recording;expect(stop).toHaveBeenCalledOnce();expect(voice.phase).toBe('ready');
  });
  it('does not speak invalid model output',async()=> {
    const events:VoiceEvent[]=[];const voice=new VoiceOrchestrator(e=>events.push(e));const a=adapters();voice.adapters=a;
    vi.mocked(a.tutor.reply).mockResolvedValue({spoken:'Raw bad output',action:'arbitrary'} as any);
    voice.ask('test');await flush();expect(voice.phase).toBe('error');expect(a.synthesis.synthesize).not.toHaveBeenCalled();expect(events.some(e=>e.type==='reply')).toBe(false);
  });
});
it('starts the next question without waiting for cancelled synthesis to finish', async () => {
  const events:VoiceEvent[]=[]; const voice = new VoiceOrchestrator(e => events.push(e)), a = adapters(); voice.adapters = a;
  const old = deferred<any>(); vi.mocked(a.synthesis.synthesize).mockImplementationOnce(() => old.promise);
  a.interrupt = vi.fn();
  voice.ask('old'); await flush(); voice.ask('new'); await flush();
  expect(plays).toBe(1); expect(a.interrupt).toHaveBeenCalled();
  old.resolve({pcm:new Float32Array(10),sampleRate:24000}); await flush();
  expect(plays).toBe(1); voice.stop();
});
it('plays a validated first sentence while preparing the second and preserves step timing', async () => {
  const events:VoiceEvent[]=[]; const voice = new VoiceOrchestrator(e => events.push(e)), a=adapters(); voice.adapters=a;
  vi.mocked(a.tutor.reply).mockResolvedValue({ spoken:'Look at the top. There are two bumpers.', action:'highlight', controlId:'r1' });
  const second = deferred<any>();
  vi.mocked(a.synthesis.synthesize).mockImplementationOnce(async () => ({pcm:new Float32Array(10),sampleRate:24000})).mockImplementationOnce(() => second.promise);
  voice.ask('where'); await flush();
  expect(plays).toBe(1); expect(a.synthesis.synthesize).toHaveBeenNthCalledWith(2,'There are two bumpers.');
  sources[0].onended!(); await flush(); expect(plays).toBe(1);
  second.resolve({pcm:new Float32Array(10),sampleRate:24000}); await flush(); expect(plays).toBe(2);
  sources[1].onended!(); await flush(); expect(voice.phase).toBe('ready');
});
