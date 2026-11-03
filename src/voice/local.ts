import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { knowledgeResponseSchema } from '../tutor/schema';
import { KnowledgeTutor, loadKnowledge, type GameSelection } from '../tutor/knowledge';
import type { Progress, VoiceAdapters } from './types';
import { modelConfig } from './config';
export class WorkerRPC {
  private sequence = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  constructor(private worker: Worker, private progress: (p: Progress) => void) {
    worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      if (data.progress) { this.progress({ stage: data.progress.file ?? data.progress.status ?? 'Loading audio model', progress: data.progress.progress }); return; }
      this.pending.delete(data.id);
      if (data.error) request.reject(Error(data.error)); else request.resolve(data.value);
    };
    worker.onerror = () => this.dispose('Audio worker failed. Please reload and retry.');
  }
  request<T>(op: string, payload: object = {}): Promise<T> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, op, ...payload }); });
  }
  dispose(reason = 'Worker stopped.') { this.worker.terminate(); for (const p of this.pending.values()) p.reject(Error(reason)); this.pending.clear(); }
}
export interface LocalRuntime { adapters: VoiceAdapters; setGame(game: GameSelection): void; getGame(): string | null; dispose(): void }
export async function loadLocal(progress: (p: Progress) => void, signal?: AbortSignal, game: GameSelection = null): Promise<LocalRuntime> {
  signal?.throwIfAborted();
  const asr = new WorkerRPC(new Worker(new URL('../workers/audio.worker.ts', import.meta.url), { type: 'module' }), progress);
  const speech = new WorkerRPC(new Worker(new URL('../workers/audio.worker.ts', import.meta.url), { type: 'module' }), progress);
  const llmWorker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; asr.dispose(); speech.dispose(); llmWorker.terminate(); };
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => { rejectAbort(new DOMException('Voice setup cancelled.', 'AbortError')); cleanup(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const guard = <T>(promise: Promise<T>) => Promise.race([promise, aborted]);
  let engine: WebWorkerMLCEngine;
  let knowledge: Awaited<ReturnType<typeof loadKnowledge>>;
  try {
    progress({ stage: 'Whisper · downloading speech recognition' }); await guard(asr.request('init-asr'));
    progress({ stage: 'Qwen · downloading tutor' });
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    engine = await guard(CreateWebWorkerMLCEngine(llmWorker, modelConfig.tutor, { initProgressCallback: p => progress({ stage: p.text, progress: p.progress * 100 }) }));
    progress({ stage: 'Kokoro · downloading voice' }); await guard(speech.request('init-tts'));
    progress({ stage: 'Loading controller and game knowledge' }); knowledge = await guard(loadKnowledge(signal));
  } catch (error) { cleanup(); throw error; }
  finally { signal?.removeEventListener('abort', onAbort); }
  let tutor: KnowledgeTutor;
  try { tutor = new KnowledgeTutor(knowledge, async messages => {
    const result = await engine.chat.completions.create({ messages, temperature: .2, max_tokens: 900, response_format: { type: 'json_object', schema: JSON.stringify(knowledgeResponseSchema) } });
    return result.choices[0]?.message.content;
  },game); } catch (error) { cleanup(); throw error; }
  return {
    adapters: {
      recognition: { transcribe: pcm => asr.request<string>('transcribe', { pcm }) },
      synthesis: { synthesize: text => speech.request('synthesize', { text }) },
      tutor: {
        reply: text => tutor.reply(text),
        interrupt() { tutor.interrupt(); engine.interruptGenerate(); },
      },
    },
    setGame: selection => tutor.setGame(selection), getGame: () => tutor.gameId,
    dispose: cleanup,
  };
}
export async function capabilities(): Promise<string | null> {
  if (!isSecureContext) return 'Local voice needs HTTPS or localhost for microphone access.';
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'Microphone recording is unavailable in this browser. Controller exploration is still available.';
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu || !await gpu.requestAdapter()) return 'Local voice needs WebGPU and enough device memory. This browser cannot provide a compatible GPU. Controller exploration is still available in labelled development mode.';
  return null;
}
