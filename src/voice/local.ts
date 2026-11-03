import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { generationSchema } from '../tutor/schema';
import { KnowledgeTutor, loadKnowledge, resolveGame, buildPrompt, type GameSelection } from '../tutor/knowledge';
import type { Progress, VoiceAdapters } from './types';
import { modelConfig, tutorModels, performanceOptions, type VoicePerformanceOptions } from './config';
export class WorkerRPC {
  private sequence = 0;
  private stopped?: string;
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
  request<T>(op: string, payload: object = {}, transfer: Transferable[] = []): Promise<T> {
    if (this.stopped) return Promise.reject(Error(this.stopped));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, op, ...payload }, transfer); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  dispose(reason = 'Worker stopped.') { if (this.stopped) return; this.stopped = reason; this.worker.terminate(); for (const p of this.pending.values()) p.reject(Error(reason)); this.pending.clear(); }
}
/** ONNX has no reliable in-flight abort. Restart only busy workers; assets remain browser-cached. */
export class AudioRuntime {
  info?: { backend: string; dtype: string };
  private rpc?: WorkerRPC;
  private ready?: Promise<{ backend: string; dtype: string }>;
  private busy = 0;
  private disposed = false;
  private revision = 0;
  constructor(private op: 'init-asr' | 'init-tts', private progress: (p: Progress) => void, private backend: 'auto' | 'wasm') { this.create(); }
  private create() { this.rpc = new WorkerRPC(new Worker(new URL('../workers/audio.worker.ts', import.meta.url), { type: 'module' }), this.progress); }
  init() {
    if (this.disposed) return Promise.reject(Error('Audio runtime stopped.'));
    if (!this.rpc) this.create();
    const revision = this.revision;
    return this.ready ??= this.rpc!.request<{ backend: string; dtype: string }>(this.op, { backend: this.backend }).then(info => {
      if (revision === this.revision) this.info = info;
      return info;
    });
  }
  async request<T>(op: string, payload: object, transfer: Transferable[] = []): Promise<T> {
    const revision = this.revision;
    this.busy++;
    try {
      await this.init();
      if (revision !== this.revision || this.disposed) throw Error('Audio turn cancelled.');
      return await this.rpc!.request<T>(op, payload, transfer);
    } finally { if (revision === this.revision) this.busy--; }
  }
  interrupt() {
    if (!this.busy) return;
    this.revision++; this.busy = 0;
    this.rpc?.dispose('Audio turn cancelled.'); this.rpc = undefined; this.ready = undefined;
  }
  dispose(reason = 'Worker stopped.') { if (this.disposed) return; this.disposed = true; this.revision++; this.rpc?.dispose(reason); this.rpc = undefined; }
}
export interface WhisperRuntime { ready: ReturnType<AudioRuntime['init']>; runtime: AudioRuntime; dispose(): void }
/** Recognition-only preload, using the same backend and cancellable runtime as full voice setup. */
export function prefetchWhisper(progress: (p: Progress) => void, signal?: AbortSignal, backend: 'auto' | 'wasm' = 'auto'): WhisperRuntime {
  signal?.throwIfAborted();
  const runtime = new AudioRuntime('init-asr',progress,backend);
  const onAbort = () => runtime.dispose('Voice setup cancelled.');
  signal?.addEventListener('abort',onAbort,{ once:true });
  const dispose = () => { signal?.removeEventListener('abort',onAbort); runtime.dispose(); };
  const ready = runtime.init();
  // Always observe background failures, including when the instance is destroyed before setup.
  void ready.catch(dispose);
  return { ready,runtime,dispose };
}
export interface LocalRuntime { adapters: VoiceAdapters; setGame(game: GameSelection): void; getGame(): string | null; dispose(): void }
export async function loadLocal(progress: (p: Progress) => void, signal?: AbortSignal, game: GameSelection = null, options: VoicePerformanceOptions = {}, whisper?: WhisperRuntime): Promise<LocalRuntime> {
  signal?.throwIfAborted();
  const settings = performanceOptions(options);
  const asr = whisper?.runtime ?? new AudioRuntime('init-asr', progress, settings.audioBackend);
  const speech = new AudioRuntime('init-tts', progress, settings.audioBackend);
  const llmWorker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; whisper?.dispose(); asr.dispose(); speech.dispose(); llmWorker.terminate(); };
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => { rejectAbort(new DOMException('Voice setup cancelled.', 'AbortError')); cleanup(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const guard = <T>(promise: Promise<T>) => Promise.race([promise, aborted]);
  let engine: WebWorkerMLCEngine;
  let knowledge: Awaited<ReturnType<typeof loadKnowledge>>;
  let schema: string;
  let recognitionInfo: { backend: string; dtype: string }, synthesisInfo: { backend: string; dtype: string };
  try {
    progress({ stage: 'Whisper · downloading speech recognition' }); recognitionInfo = await guard(asr.init());
    progress({ stage: `Loading tutor · ${tutorModels[settings.tutor]}` });
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    engine = await guard(CreateWebWorkerMLCEngine(llmWorker, tutorModels[settings.tutor], { initProgressCallback: p => progress({ stage: p.text, progress: p.progress * 100 }) }));
    progress({ stage: 'Kokoro · downloading voice' }); synthesisInfo = await guard(speech.init());
    progress({ stage: 'Loading controller and game knowledge' }); knowledge = await guard(loadKnowledge(signal));
    // Keep one compiled grammar across games. Grounding still uses only the selected
    // pack, and validateKnowledgeReply rejects unavailable actions before any playback.
    schema = JSON.stringify(generationSchema([...new Set(knowledge.games.flatMap(g => g.actions.map(a => a.id)))]));
    progress({ stage: 'Warming tutor and structured response grammar' });
    await guard(engine.chat.completions.create({ messages: [{ role:'system', content:buildPrompt(knowledge,resolveGame(knowledge,game)) }, { role:'user', content:'Hello' }], max_tokens:1, response_format:{ type:'json_object', schema } }));
    await guard(engine.resetChat()); // Internal warmup tokens are never executed or spoken.
  } catch (error) { cleanup(); throw error; }
  finally { signal?.removeEventListener('abort', onAbort); }
  let tutor: KnowledgeTutor;
  let generationQueue = Promise.resolve();
  let generationRevision = 0;
  let generationStats: import('./types').GenerationStats | undefined;
  try { tutor = new KnowledgeTutor(knowledge, async messages => {
    const result = await engine.chat.completions.create({ messages, temperature: .2, max_tokens: 900, response_format: { type: 'json_object', schema } });
    const usage = result.usage;
    generationStats = usage ? { promptTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, prefillTokensPerSecond: usage.extra?.prefill_tokens_per_s, decodeTokensPerSecond: usage.extra?.decode_tokens_per_s, timeToFirstTokenMs: usage.extra ? usage.extra.time_to_first_token_s * 1000 : undefined, grammarInitMs: usage.extra?.grammar_init_s === undefined ? undefined : usage.extra.grammar_init_s * 1000 } : undefined;
    return result.choices[0]?.message.content;
  },game); } catch (error) { cleanup(); throw error; }
  const cache = new Map<string, { pcm: Float32Array; sampleRate: number }>();
  let cacheBytes = 0;
  return {
    adapters: {
      get info() { return { tutor: tutorModels[settings.tutor], recognition: { model: modelConfig.whisper, ...(asr.info ?? recognitionInfo) }, synthesis: { model: modelConfig.kokoro, ...(speech.info ?? synthesisInfo) }, voice: modelConfig.voice }; },
      interrupt() { asr.interrupt(); speech.interrupt(); },
      recognition: { transcribe: pcm => asr.request<string>('transcribe', { pcm }, [pcm.buffer as ArrayBuffer]) },
      synthesis: { async synthesize(text, options) {
        const hit = options?.cache === false ? undefined : cache.get(text);
        if (hit) { cache.delete(text); cache.set(text, hit); return hit; }
        const audio = await speech.request<{ pcm: Float32Array; sampleRate: number }>('synthesize', { text });
        const bytes = audio.pcm.byteLength;
        // Bound resident audio to 8 MiB; voice/model/settings are fixed for this runtime.
        if (options?.cache !== false && bytes <= 8 * 1024 * 1024) {
          while (cacheBytes + bytes > 8 * 1024 * 1024) { const key = cache.keys().next().value!; cacheBytes -= cache.get(key)!.pcm.byteLength; cache.delete(key); }
          cache.set(text, audio); cacheBytes += bytes;
        }
        return audio;
      } },
      tutor: {
        reply(text) {
          const revision = generationRevision;
          const result = generationQueue.then(() => { if (cleaned || revision !== generationRevision) throw Error('Tutor turn cancelled.'); return tutor.reply(text); });
          generationQueue = result.then(() => {}, () => {});
          return result;
        },
        stats: () => generationStats,
        interrupt() { generationRevision++; tutor.interrupt(); engine.interruptGenerate(); },
      },
    },
    setGame: selection => tutor.setGame(selection), getGame: () => tutor.gameId,
    dispose() { cache.clear(); cacheBytes = 0; cleanup(); },
  };
}
export async function capabilities(): Promise<string | null> {
  if (!isSecureContext) return 'Local voice needs HTTPS or localhost for microphone access.';
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'Microphone recording is unavailable in this browser. Controller exploration is still available.';
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu || !await gpu.requestAdapter()) return 'Local voice needs WebGPU and enough device memory. This browser cannot provide a compatible GPU. Controller exploration is still available in labelled development mode.';
  return null;
}
