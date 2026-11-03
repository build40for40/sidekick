import { afterEach, expect, it, vi } from 'vitest';
import { trimSilence, speechSentences } from '../src/voice/audio';
import { AudioRuntime } from '../src/voice/local';
import { PCMCapture } from '../src/voice/capture';
import { generationSchema } from '../src/tutor/schema';
afterEach(() => vi.unstubAllGlobals());
it('constrains decoder identifiers to semantic controls and explicitly selected game actions', () => {
  const controller = generationSchema([]) as any, game = generationSchema(['chop']) as any;
  expect(controller.properties.actionId).toEqual({ enum:[null] });
  expect(game.properties.actionId).toEqual({ enum:[null,'chop'] });
  expect(game.properties.steps.items.properties.controlId.enum).toContain('r1');
  expect(JSON.stringify(game)).not.toContain('description');
});
it('trims edge silence with padding while preserving a quiet onset and internal pauses', () => {
  const pcm = new Float32Array(48000);
  pcm.fill(.001, 12500, 16000); pcm.fill(.1,16000,20000); pcm.fill(.1,28000,30000);
  const trimmed = trimSilence(pcm);
  expect(trimmed.length).toBeLessThan(pcm.length);
  expect(trimmed.length).toBeGreaterThan(18000);
  expect(trimmed.some(x => x === Math.fround(.001))).toBe(true);
  expect(trimmed.filter(x => x === 0).length).toBeGreaterThan(8000);
  expect(() => trimSilence(new Float32Array(16000))).toThrow('quiet');
});
it('preserves decimal numbers and all sentence content', () => {
  expect(speechSentences('Use 0.5 seconds. Then press X!')).toEqual(['Use 0.5 seconds.', 'Then press X!']);
  expect(speechSentences('Press X')).toEqual(['Press X']);
});
it('terminates busy ONNX work, rejects its request and lazily loads a replacement worker', async () => {
  const workers: any[] = [];
  class Worker {
    onmessage: any; onerror: any; terminate = vi.fn(); messages: any[] = [];
    constructor() { workers.push(this); }
    postMessage(message: any) {
      this.messages.push(message);
      if (message.op.startsWith('init')) queueMicrotask(() => this.onmessage({ data: { id: message.id, value: { backend:'wasm', dtype:'q8' } } }));
      else if (workers.length === 2) queueMicrotask(() => this.onmessage({ data: { id: message.id, value: 'new result' } }));
    }
  }
  vi.stubGlobal('Worker', Worker);
  const audio = new AudioRuntime('init-asr', () => {}, 'wasm');
  await audio.init();
  audio.interrupt(); expect(workers[0].terminate).not.toHaveBeenCalled();
  const old = audio.request('transcribe', {}); const rejected = expect(old).rejects.toThrow('cancelled');
  await Promise.resolve(); audio.interrupt(); await rejected;
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(await audio.request('transcribe', {})).toBe('new result');
  expect(workers).toHaveLength(2);
  audio.dispose(); expect(workers[1].terminate).toHaveBeenCalledOnce();
  await expect(audio.init()).rejects.toThrow('stopped');
});
it('flushes captured PCM before stopping and disconnects every audio node', async () => {
  let node: any;
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  class Worklet {
    port = { onmessage: null as any, postMessage: vi.fn(() => {
      queueMicrotask(() => {
        this.port.onmessage?.({ data: new Float32Array([.3]) });
        this.port.onmessage?.({ data:'finished' });
      });
    }), close:vi.fn() };
    connect = vi.fn(); disconnect = vi.fn();
    constructor() { node = this; }
  }
  vi.stubGlobal('AudioWorkletNode',Worklet);
  const context = { audioWorklet:{ addModule:vi.fn(async () => {}) }, createMediaStreamSource: () => source, destination:{} };
  const capture = new PCMCapture(context as unknown as AudioContext);
  await capture.start({} as MediaStream);
  node.port.onmessage({ data:new Float32Array([.1,.2]) });
  expect(await capture.stop()).toEqual(new Float32Array([.1,.2,.3]));
  expect(source.disconnect).toHaveBeenCalled(); expect(node.disconnect).toHaveBeenCalled(); expect(node.port.close).toHaveBeenCalledOnce();
});
it('disposes a capture cancelled while its worklet module is still loading', async () => {
  let resolve!: () => void;
  const module = new Promise<void>(r => { resolve = r; });
  const source = vi.fn();
  const capture = new PCMCapture({ audioWorklet:{addModule:()=>module},createMediaStreamSource:source } as unknown as AudioContext);
  const starting = capture.start({} as MediaStream); capture.dispose(); resolve(); await starting;
  expect(source).not.toHaveBeenCalled(); expect(await capture.stop()).toHaveLength(0);
});
