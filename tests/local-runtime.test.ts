import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create:vi.fn(), reset:vi.fn(async () => {}), interrupt:vi.fn() }));
vi.mock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine:async () => ({ chat:{completions:{create:mocks.create}},resetChat:mocks.reset,interruptGenerate:mocks.interrupt }) }));
vi.mock('../src/tutor/knowledge', async original => ({ ...await original<typeof import('../src/tutor/knowledge')>(), loadKnowledge:async () => ({ prompt:'Use only supplied facts.',activeGame:'test',games:[{id:'test',name:'Test',controller:'ps5',preset:'default',default_mode:'default',coach_notes:[],actions:[],terms:[]}] }) }));
import { loadLocal } from '../src/voice/local';
afterEach(() => {vi.unstubAllGlobals();vi.clearAllMocks();});
it('warms a single grammar, reuses it after game changes and keeps audio caching optional', async () => {
  let syntheses = 0;
  class Worker {
    onmessage:any; onerror:any; terminate=vi.fn();
    postMessage(message:any) { queueMicrotask(() => this.onmessage({data:{id:message.id,value:message.op === 'synthesize' ? (syntheses++, {pcm:new Float32Array(10),sampleRate:24000}) : {backend:'wasm',dtype:'q8'}}})); }
  }
  vi.stubGlobal('Worker',Worker);
  mocks.create.mockResolvedValue({choices:[{message:{content:JSON.stringify({spoken:'Which game?',found:false,actionId:null,steps:[],jargon:null})}}]});
  const runtime = await loadLocal(() => {}, undefined, null, {audioBackend:'wasm'});
  expect(mocks.create.mock.calls[0][0].max_tokens).toBe(1); expect(mocks.reset).toHaveBeenCalledOnce();
  await runtime.adapters.tutor.reply('Question'); runtime.setGame('test'); await runtime.adapters.tutor.reply('Question');
  expect(mocks.create.mock.calls[1][0].response_format.schema).toBe(mocks.create.mock.calls[2][0].response_format.schema);
  const synth = runtime.adapters.synthesis;
  await synth.synthesize('Hello'); await synth.synthesize('Hello'); expect(syntheses).toBe(1);
  await synth.synthesize('Hello',{cache:false}); expect(syntheses).toBe(2);
  runtime.dispose();
});
it('drops an old queued tutor request after interruption before it enters model inference', async () => {
  class Worker {
    onmessage:any; onerror:any; terminate=vi.fn();
    postMessage(message:any) { queueMicrotask(() => this.onmessage({data:{id:message.id,value:{backend:'wasm',dtype:'q8'}}})); }
  }
  vi.stubGlobal('Worker',Worker);
  mocks.create.mockResolvedValue({choices:[{message:{content:JSON.stringify({spoken:'Which game?',found:false,actionId:null,steps:[],jargon:null})}}]});
  const runtime = await loadLocal(() => {});
  let resolve!: (value:any) => void;
  mocks.create.mockImplementationOnce(() => new Promise(r => {resolve=r;}));
  const first = runtime.adapters.tutor.reply('first'); const rejectedFirst = expect(first).rejects.toThrow('cancelled');
  await Promise.resolve(); await Promise.resolve();
  const second = runtime.adapters.tutor.reply('second'); const rejectedSecond = expect(second).rejects.toThrow('cancelled');
  runtime.adapters.tutor.interrupt();
  resolve({choices:[{message:{content:JSON.stringify({spoken:'Which game?',found:false,actionId:null,steps:[],jargon:null})}}]});
  await rejectedFirst; await rejectedSecond;
  expect(mocks.create).toHaveBeenCalledTimes(2); // Warmup + first only.
  runtime.dispose();
});
it('remote mode creates only audio workers, reuses knowledge validation, and releases resources', async () => {
  const workers: any[] = [];
  class Worker {
    onmessage:any; onerror:any; terminate=vi.fn();
    constructor() { workers.push(this); }
    postMessage(message:any) { queueMicrotask(() => this.onmessage({data:{id:message.id,value:{backend:'wasm',dtype:'q8'}}})); }
  }
  vi.stubGlobal('Worker',Worker);
  const reply={spoken:'Which game?',found:false,actionId:null,steps:[],jargon:null};
  const fetch=vi.fn(async () => Response.json({reply}));vi.stubGlobal('fetch',fetch);
  const {loadRemote}=await import('../src/voice/local');
  const runtime=await loadRemote(()=>{},undefined,null,{audioBackend:'wasm'},undefined,{mode:'remote',endpoint:'/api/tutor',model:'google:test'});
  expect(workers).toHaveLength(2);expect(mocks.create).not.toHaveBeenCalled();
  expect(runtime.adapters.info?.tutor).toBe('google:test');
  expect(await runtime.adapters.tutor.reply('Help')).toEqual(reply);
  runtime.dispose();runtime.dispose();workers.forEach(worker=>expect(worker.terminate).toHaveBeenCalledOnce());
});
