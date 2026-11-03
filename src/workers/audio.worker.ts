import { modelConfig } from '../voice/config';
// Separate workers avoid placing model evaluation or speech synthesis on the UI thread.
let transcriber: Awaited<ReturnType<typeof createRecognizer>> | undefined;
let tts: Awaited<ReturnType<typeof createSynthesizer>> | undefined;
async function createRecognizer(progress_callback: (p: unknown) => void, backend: 'auto' | 'wasm') {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  if (backend === 'auto') try {
    const model = await pipeline('automatic-speech-recognition', modelConfig.whisper, { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback });
    try { await model(new Float32Array(3200), { max_new_tokens:1 }); }
    catch (error) { await model.dispose(); throw error; }
    return { model, backend: 'webgpu', dtype: 'encoder fp32 / decoder q4' };
  } catch { progress_callback({ status: 'Whisper GPU unavailable; using local WASM q8' }); }
  return { model: await pipeline('automatic-speech-recognition', modelConfig.whisper, { device: 'wasm', dtype: 'q8', progress_callback }), backend: 'wasm', dtype: 'q8' };
}
async function createSynthesizer(progress_callback: (p: unknown) => void, backend: 'auto' | 'wasm') {
  const { KokoroTTS } = await import('kokoro-js');
  if (backend === 'auto') try {
    const model = await KokoroTTS.from_pretrained(modelConfig.kokoro, { device: 'webgpu', dtype: 'fp32', progress_callback });
    try { await model.generate('Ready.', { voice: modelConfig.voice }); }
    catch (error) { await model.model.dispose(); throw error; }
    return { model, backend: 'webgpu', dtype: 'fp32' };
  } catch { progress_callback({ status: 'Kokoro GPU unavailable; using local WASM q8' }); }
  const model = await KokoroTTS.from_pretrained(modelConfig.kokoro, { device: 'wasm', dtype: 'q8', progress_callback });
  await model.generate('Ready.', { voice: modelConfig.voice });
  return { model, backend: 'wasm', dtype: 'q8' };
}
self.onmessage = async ({ data }: MessageEvent<{ id: number; op: string; pcm?: Float32Array; text?: string; backend?: 'auto' | 'wasm' }>) => {
  const { id, op } = data;
  const progress = (value: unknown) => self.postMessage({ id, progress: value });
  try {
    let value: unknown;
    if (op === 'init-asr') { transcriber = await createRecognizer(progress, data.backend ?? 'auto'); value = { backend: transcriber.backend, dtype: transcriber.dtype }; }
    else if (op === 'init-tts') { tts = await createSynthesizer(progress, data.backend ?? 'auto'); value = { backend: tts.backend, dtype: tts.dtype }; }
    else if (op === 'transcribe') {
      if (!transcriber || !data.pcm) throw Error('Recognition model is not ready.');
      const result = await transcriber.model(data.pcm, { chunk_length_s: 20, stride_length_s: 3 });
      value = Array.isArray(result) ? result.map(r => r.text).join(' ') : result.text;
    } else if (op === 'synthesize') {
      if (!tts || !data.text) throw Error('Speech model is not ready.');
      const audio = await tts.model.generate(data.text, { voice: modelConfig.voice });
      value = { pcm: audio.audio, sampleRate: audio.sampling_rate };
    } else throw Error('Unknown worker operation.');
    const transfer = op === 'synthesize' ? [(value as { pcm: Float32Array }).pcm.buffer] : [];
    self.postMessage({ id, value }, { transfer });
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
