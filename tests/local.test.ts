import { afterEach, expect, it, vi } from 'vitest';
import { capabilities, loadLocal, prefetchWhisper, WorkerRPC } from '../src/voice/local';
afterEach(()=>vi.unstubAllGlobals());
it('prefetches only recognition and reuses the same worker during full setup, with idempotent abort cleanup',async()=> {
  const workers:any[]=[];
  class PendingWorker {
    onmessage:any; onerror:any; terminate=vi.fn(); postMessage=vi.fn();
    constructor(){workers.push(this);}
  }
  vi.stubGlobal('Worker',PendingWorker);
  const abort=new AbortController();
  const whisper=prefetchWhisper(()=>{},abort.signal);
  expect(workers).toHaveLength(1);expect(workers[0].postMessage).toHaveBeenCalledWith({id:1,op:'init-asr',backend:'auto'},[]);
  const loading=loadLocal(()=>{},abort.signal,null,{},whisper);const rejected=expect(loading).rejects.toThrow('cancelled');
  expect(workers).toHaveLength(3);
  expect(workers.flatMap(worker=>worker.postMessage.mock.calls).filter(([message])=>message.op==='init-asr')).toHaveLength(1);
  abort.abort();await rejected;whisper.dispose();
  workers.forEach(worker=>expect(worker.terminate).toHaveBeenCalledOnce());
});
it('cleans up a failed background prefetch without an unhandled rejection',async()=> {
  let worker:any;
  class FailedWorker {
    onmessage:any; onerror:any; terminate=vi.fn();
    constructor(){worker=this;}
    postMessage(message:any){queueMicrotask(()=>this.onmessage({data:{id:message.id,error:'Download failed'}}));}
  }
  vi.stubGlobal('Worker',FailedWorker);
  const whisper=prefetchWhisper(()=>{});
  await expect(whisper.ready).rejects.toThrow('Download failed');
  whisper.dispose();expect(worker.terminate).toHaveBeenCalledOnce();
});
it('reports unsupported WebGPU without a browser speech fallback',async()=> {
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('MediaRecorder',class{});
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia(){} }});
  expect(await capabilities()).toContain('WebGPU');
});
it('cleans up every worker on a download failure',async()=> {
  const workers:any[]=[];
  class FailedDownloadWorker {
    onmessage:any; onerror:any; terminate=vi.fn();
    constructor(){workers.push(this);}
    postMessage(message:any){queueMicrotask(()=>this.onmessage({data:{id:message.id,error:'Network unavailable'}}));}
  }
  vi.stubGlobal('Worker',FailedDownloadWorker);
  await expect(loadLocal(()=>{})).rejects.toThrow('Network unavailable');
  expect(workers).toHaveLength(3);workers.forEach(worker=>expect(worker.terminate).toHaveBeenCalledOnce());
});
it('ignores worker messages whose request no longer exists',async()=> {
  const worker={onmessage:null as any,onerror:null as any,postMessage:vi.fn(),terminate:vi.fn()};
  const progress=vi.fn();const rpc=new WorkerRPC(worker as unknown as Worker,progress);
  const promise=rpc.request('transcribe');const rejection=expect(promise).rejects.toThrow('stopped');rpc.dispose();
  worker.onmessage({data:{id:1,value:'late'}});worker.onmessage({data:{id:1,progress:{progress:80}}});
  await rejection;expect(progress).not.toHaveBeenCalled();
});
it('aborts an in-flight model setup and terminates all workers once', async () => {
  const workers: any[] = [];
  class PendingWorker {
    onmessage: any; onerror: any; terminate = vi.fn();
    constructor() { workers.push(this); }
    postMessage() {}
  }
  vi.stubGlobal('Worker', PendingWorker);
  const abort = new AbortController();
  const loading = loadLocal(() => {}, abort.signal);
  const rejected = expect(loading).rejects.toThrow('cancelled');
  abort.abort(); await rejected;
  expect(workers).toHaveLength(3);
  workers.forEach(worker => expect(worker.terminate).toHaveBeenCalledOnce());
});
it('remote generation allows local WASM audio without requiring WebGPU', async () => {
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('MediaRecorder',class{});
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia(){}}});
  expect(await capabilities('remote')).toBeNull();
  expect(await capabilities()).toContain('WebGPU');
});
