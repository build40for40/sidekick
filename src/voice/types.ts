import type { TutorReply, TutorStep } from '../tutor/schema';
export type Phase = 'ready' | 'downloading' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';
export interface Progress { stage: string; progress?: number }
export interface RecognitionAdapter { transcribe(pcm: Float32Array): Promise<string> }
export interface GenerationStats { promptTokens: number; outputTokens: number; prefillTokensPerSecond?: number; decodeTokensPerSecond?: number; timeToFirstTokenMs?: number; grammarInitMs?: number }
export interface TutorAdapter { reply(text: string): Promise<TutorReply>; interrupt(): void; stats?(): GenerationStats | undefined }
export interface SynthesisAdapter { synthesize(text: string, options?: { cache?: boolean }): Promise<{ pcm: Float32Array; sampleRate: number }> }
export interface RuntimeInfo { tutor: string; recognition: { model: string; backend: string; dtype: string }; synthesis: { model: string; backend: string; dtype: string }; voice: string }
export interface VoiceAdapters { recognition: RecognitionAdapter; tutor: TutorAdapter; synthesis: SynthesisAdapter; interrupt?(): void; info?: RuntimeInfo }
export type VoiceEvent = { type: 'phase'; phase: Phase } | { type: 'error'; message: string } | { type: 'transcript'; text: string } | { type: 'reply'; reply: TutorReply } | { type: 'step'; step: TutorStep; index: number; durationMs: number } | { type: 'demonstration'; steps: TutorStep[]; completedPasses: number } | { type: 'timing'; timings: Timings };
export interface Timings { transcription: number; generation: number; synthesis: number; firstAudible?: number; queueWait?: number; preparation?: number; recordingSeconds?: number; recognisedSeconds?: number; firstChunk?: number; generationStats?: GenerationStats; runtime?: RuntimeInfo }
