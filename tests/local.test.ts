import { afterEach, expect, it, vi } from 'vitest';
import { capabilities, loadLocal, WorkerRPC } from '../src/voice/local';
afterEach(()=>vi.unstubAllGlobals());
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
