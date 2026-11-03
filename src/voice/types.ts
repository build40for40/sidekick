import type { TutorReply } from '../tutor/schema';
export type Phase = 'ready' | 'downloading' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';
export interface Progress { stage: string; progress?: number }
export interface RecognitionAdapter { transcribe(pcm: Float32Array): Promise<string> }
export interface TutorAdapter { reply(text: string): Promise<TutorReply>; interrupt(): void }
export interface SynthesisAdapter { synthesize(text: string): Promise<{ pcm: Float32Array; sampleRate: number }> }
export interface VoiceAdapters { recognition: RecognitionAdapter; tutor: TutorAdapter; synthesis: SynthesisAdapter }
export type VoiceEvent = { type: 'phase'; phase: Phase } | { type: 'error'; message: string } | { type: 'transcript'; text: string } | { type: 'reply'; reply: TutorReply } | { type: 'timing'; timings: Timings };
export interface Timings { transcription: number; generation: number; synthesis: number; firstAudible?: number }
