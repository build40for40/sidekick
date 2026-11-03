import { modelConfig } from '../voice/config';
// Separate workers avoid placing model evaluation or speech synthesis on the UI thread.
let transcriber: Awaited<ReturnType<typeof createRecognizer>> | undefined;
let tts: Awaited<ReturnType<typeof createSynthesizer>> | undefined;
async function createRecognizer(progress_callback: (p: unknown) => void) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  return pipeline('automatic-speech-recognition', modelConfig.whisper, { device: 'wasm', dtype: 'q8', progress_callback });
}
async function createSynthesizer(progress_callback: (p: unknown) => void) {
  const { KokoroTTS } = await import('kokoro-js');
  return KokoroTTS.from_pretrained(modelConfig.kokoro, { device: 'wasm', dtype: 'q8', progress_callback });
}
self.onmessage = async ({ data }: MessageEvent<{ id: number; op: string; pcm?: Float32Array; text?: string }>) => {
  const { id, op } = data;
  const progress = (value: unknown) => self.postMessage({ id, progress: value });
  try {
    let value: unknown;
    if (op === 'init-asr') { transcriber = await createRecognizer(progress); value = true; }
    else if (op === 'init-tts') { tts = await createSynthesizer(progress);
      progress({ status: 'Warming up voice and caching voice assets' });
      await tts.generate('Ready.', { voice: modelConfig.voice }); value = true; }
    else if (op === 'transcribe') {
      if (!transcriber || !data.pcm) throw Error('Recognition model is not ready.');
      const result = await transcriber(data.pcm, { chunk_length_s: 20, stride_length_s: 3 });
      value = Array.isArray(result) ? result.map(r => r.text).join(' ') : result.text;
    } else if (op === 'synthesize') {
      if (!tts || !data.text) throw Error('Speech model is not ready.');
      const audio = await tts.generate(data.text, { voice: modelConfig.voice });
      value = { pcm: audio.audio, sampleRate: audio.sampling_rate };
    } else throw Error('Unknown worker operation.');
    self.postMessage({ id, value });
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
