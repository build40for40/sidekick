export const tutorModels = {
  fast: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  quality: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  compact: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
} as const;
export interface VoicePerformanceOptions {
  tutor?: keyof typeof tutorModels;
  /** auto tries WebGPU, then local WASM; wasm provides a comparison baseline. */
  audioBackend?: 'auto' | 'wasm';
}
export function performanceOptions(options: VoicePerformanceOptions = {}): Required<VoicePerformanceOptions> {
  const tutor = options.tutor ?? 'quality', audioBackend = options.audioBackend ?? 'auto';
  if (!Object.hasOwn(tutorModels, tutor) || !['auto', 'wasm'].includes(audioBackend)) throw Error('Invalid voice performance options.');
  return { tutor, audioBackend };
}
export const modelConfig = {
  whisper: 'onnx-community/whisper-tiny.en',
  kokoro: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  voice: 'af_heart' as const,
};
