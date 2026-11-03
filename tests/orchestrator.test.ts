import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceOrchestrator } from '../src/voice/orchestrator';
import type { VoiceEvent, VoiceAdapters } from '../src/voice/types';
const flush=async()=>{ for(let i=0;i<20;i++) await Promise.resolve(); };
function deferred<T>() { let resolve!:(x:T)=>void; const promise=new Promise<T>(r=>resolve=r); return {promise,resolve}; }
let plays=0, stops=0;
class FakeAudioContext {
  state='running'; baseLatency=0;
  resume(){return Promise.resolve();}
  createBuffer(){return {copyToChannel(){}};}
  createBufferSource(){return {buffer:null,onended:null,connect(){},start(){plays++;},stop(){stops++;}};}
}
function adapters():VoiceAdapters {return {
  recognition:{transcribe:vi.fn(async()=> 'Where is A?')},
  tutor:{reply:vi.fn(async()=>({spoken:'Here is Cross.',action:'highlight' as const,controlId:'cross'})),interrupt:vi.fn()},
  synthesis:{synthesize:vi.fn(async()=>({pcm:new Float32Array(10),sampleRate:24000}))},
};}
beforeEach(()=>{plays=0;stops=0;vi.stubGlobal('AudioContext',FakeAudioContext);});
afterEach(()=>vi.unstubAllGlobals());
describe('turn orchestration',()=> {
  it('ignores a stale generation after a new question',async()=> {
    const events:VoiceEvent[]=[];const voice=new VoiceOrchestrator(e=>events.push(e));const a=adapters();voice.adapters=a;
    const delayed=deferred<any>();vi.mocked(a.tutor.reply).mockImplementationOnce(()=>delayed.promise);
    voice.ask('old');await flush();voice.ask('new');delayed.resolve({spoken:'Stale.',action:'press',controlId:'circle'});await flush();
    expect(events.filter(e=>e.type==='reply')).toEqual([{type:'reply',reply:{spoken:'Here is Cross.',action:'highlight',controlId:'cross'}}]);expect(plays).toBe(1);
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
