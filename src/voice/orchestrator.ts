import { transitionPhase } from './machine';
import { TurnGate } from './turn';
import type { Phase, VoiceAdapters, VoiceEvent, Timings } from './types';
import { validateReply, replySteps, type TutorReply, type TutorStep } from '../tutor/schema';
import { developmentReply } from '../tutor/development';
import { speechSentences, trimSilence } from './audio';
import { PCMCapture } from './capture';
export class VoiceOrchestrator {
  private gate = new TurnGate();
  private recorder?: MediaRecorder;
  private capture?: PCMCapture;
  private recordingTurn?: number;
  private stream?: MediaStream;
  private audio?: AudioContext;
  private playback?: AudioBufferSourceNode;
  private timer?: ReturnType<typeof setTimeout>;
  private queue = Promise.resolve();
  private lastReply?: TutorReply;
  private finishPlayback?: () => void;
  phase: Phase = 'ready';
  adapters?: VoiceAdapters;
  constructor(private emit: (event: VoiceEvent) => void) {}
  private state(phase: Phase) { this.phase = transitionPhase(this.phase, phase); this.emit({ type: 'phase', phase }); }
  private fail(error: unknown) { this.state('error'); this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
  unlockAudio() {
    this.audio ??= new AudioContext();
    void this.audio.resume().catch(e => this.fail(e));
  }
  beginDownload() { this.stop(); this.state('downloading'); }
  finishDownload() { this.state('ready'); }
  downloadFailed(error: unknown) { this.fail(error); }
  stop() {
    this.gate.invalidate(); this.adapters?.tutor.interrupt();
    this.adapters?.interrupt?.();
    // Old promises still settle safely behind the turn gate; new turns never queue behind them.
    this.queue = Promise.resolve();
    this.capture?.dispose(); this.capture = undefined; this.recordingTurn = undefined;
    if (this.playback) { this.playback.onended = null; try { this.playback.stop(); } catch { /* already stopped */ } this.playback = undefined; }
    this.finishPlayback?.(); this.finishPlayback = undefined;
    if (this.recorder?.state === 'recording') { this.recorder.onstop = null; this.recorder.stop(); }
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
    clearTimeout(this.timer); this.state('ready');
  }
  dispose() { this.stop(); void this.audio?.close(); this.audio = undefined; }
  resetConversation() { this.stop(); this.lastReply = undefined; }
  async startRecording() {
    if (!this.adapters) { this.fail(Error('Download local voice models first. The host can also provide a text question.')); return; }
    this.stop(); this.unlockAudio();
    const turn = this.gate.next();
    this.state('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!this.gate.current(turn)) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      if (this.audio!.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const capture = new PCMCapture(this.audio!); this.capture = capture;
        await capture.start(stream);
        if (!this.gate.current(turn)) { capture.dispose(); return; }
        this.recordingTurn = turn;
        this.timer = setTimeout(() => this.finishRecording(), 30000);
        return;
      }
      const recorder = new MediaRecorder(stream); this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { if (this.gate.current(turn)) { this.stop(); this.fail(Error('Recording failed. Please try again.')); } };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); clearTimeout(this.timer);
        if (!this.gate.current(turn)) return;
        const ended = performance.now(); this.state('transcribing');
        this.enqueue(turn, async () => {
          const started = performance.now();
          const blob = new Blob(chunks, { type: recorder.mimeType });
          if (blob.size < 100) throw Error('No audio was recorded. Try again or type a question.');
          const decoded = await this.audio!.decodeAudioData(await blob.arrayBuffer());
          await this.recognise(decoded, turn, ended, started);
        });
      };
      recorder.start(); this.timer = setTimeout(() => this.finishRecording(), 30000);
    } catch (error) {
      if (this.gate.current(turn)) { this.stop(); this.fail(error instanceof DOMException && error.name === 'NotAllowedError' ? Error('Microphone permission was denied. Allow it in Chrome’s site settings and try again, or use the host’s text input.') : error); }
    }
  }
  finishRecording() {
    if (this.capture && this.recordingTurn !== undefined) {
      const capture = this.capture, turn = this.recordingTurn, ended = performance.now(), stream = this.stream;
      this.recordingTurn = undefined; clearTimeout(this.timer); this.state('transcribing');
      const samples = capture.stop();
      stream?.getTracks().forEach(t => t.stop());
      this.enqueue(turn, async () => {
        const started = performance.now(), pcm = await samples;
        if (!this.gate.current(turn)) return;
        this.stream = undefined;
        if (!pcm.length) throw Error('No audio was recorded. Try again.');
        const decoded = this.audio!.createBuffer(1, pcm.length, this.audio!.sampleRate);
        decoded.copyToChannel(new Float32Array(pcm), 0);
        await this.recognise(decoded, turn, ended, started);
      });
    } else if (this.recorder?.state === 'recording') this.recorder.stop();
    else if (this.phase === 'listening') this.stop();
  }
  private async recognise(decoded: AudioBuffer, turn: number, ended: number, started: number) {
    if (!this.gate.current(turn)) return;
    let raw: Float32Array;
    if (decoded.sampleRate === 16000) raw = decoded.getChannelData(0);
    else {
      const offline = new OfflineAudioContext(1, Math.max(1,Math.ceil(decoded.duration*16000)), 16000);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      raw = (await offline.startRendering()).getChannelData(0);
    }
    const pcm = trimSilence(raw), recognisedSeconds = pcm.length / 16000;
    if (!this.gate.current(turn)) return;
    const t = performance.now();
    const text = (await this.adapters!.recognition.transcribe(pcm)).trim();
    if (!this.gate.current(turn)) return;
    if (!text || /^\[.*\]$/.test(text)) throw Error('No speech recognised. Try again or type a question.');
    this.emit({ type: 'transcript', text });
    await this.generate(text, turn, ended, performance.now()-t, { queueWait: started-ended, preparation: t-started, recordingSeconds: decoded.duration, recognisedSeconds });
  }
  ask(text: string) {
    if (!text.trim()) return;
    const ended = performance.now();
    this.stop(); this.unlockAudio(); const turn = this.gate.next();
    this.emit({ type: 'transcript', text }); this.state('thinking');
    this.enqueue(turn, () => this.generate(text, turn, ended, 0, { queueWait: performance.now()-ended }));
  }
  private enqueue(turn: number, operation: () => Promise<void>) {
    this.queue = this.queue.then(async () => { if (this.gate.current(turn)) await operation(); }).catch(error => { if (this.gate.current(turn)) this.fail(error); });
  }
  private async generate(text: string, turn: number, ended: number, transcription: number, details: Partial<Timings> = {}) {
    if (!this.gate.current(turn)) return;
    this.state('thinking'); const t = performance.now();
    const reply = validateReply(this.adapters ? await this.adapters.tutor.reply(text) : developmentReply(text));
    if (!this.gate.current(turn)) return;
    this.emit({ type: 'reply', reply }); this.lastReply = reply;
    const timings: Timings = { transcription, generation: performance.now()-t, synthesis: 0, ...details, generationStats: this.adapters?.tutor.stats?.(), runtime: this.adapters?.info };
    await this.playReply(reply,turn,timings,ended);
  }
  repeat() {
    if (!this.lastReply) return;
    const ended = performance.now();
    this.stop(); if (this.adapters) this.unlockAudio(); const turn = this.gate.next();
    const reply = this.lastReply;
    this.enqueue(turn, () => this.playReply(reply,turn,{ transcription: 0, generation: 0, synthesis: 0 },ended));
  }
  private async playReply(reply: TutorReply, turn: number, timings: Timings, ended: number) {
    const steps = replySteps(reply);
    if (this.adapters) {
      const segments: { text: string; cue?: { step: TutorStep; index: number } }[] = speechSentences(reply.spoken).map(text => ({ text }));
      // Keep each step intact so its animation starts with that instruction, not prefetch.
      if ('steps' in reply) segments.push(...steps.map((step, index) => ({ text: step.say, cue: { step, index } })));
      await this.speak(segments,turn,timings,ended);
    }
    if (!this.gate.current(turn)) return;
    this.state('ready');
    this.emit({ type: 'demonstration', steps, completedPasses: this.adapters && 'steps' in reply ? 1 : 0 });
  }
  private async speak(segments: { text: string; cue?: { step: TutorStep; index: number } }[], turn: number, timings: Timings, ended: number) {
    if (!this.gate.current(turn)) return;
    this.state('speaking');
    // All text comes from the fully validated reply. Never synthesize partial LLM JSON.
    const prepare = async (sentence: string) => {
      const started = performance.now();
      const result = await this.adapters!.synthesis.synthesize(sentence);
      if (this.gate.current(turn)) timings.synthesis += performance.now()-started;
      return result;
    };
    let prepared = prepare(segments[0].text);
    for (let index = 0; index < segments.length; index++) {
      const cue = segments[index].cue;
      const { pcm, sampleRate } = await prepared;
      if (!this.gate.current(turn)) return;
      timings.runtime = this.adapters?.info;
      timings.firstChunk ??= timings.synthesis;
      const audio = this.audio!;
      if (audio.state !== 'running') throw Error('Audio playback is paused by the browser. Click Repeat to allow playback.');
      const buffer = audio.createBuffer(1, pcm.length, sampleRate); buffer.copyToChannel(new Float32Array(pcm),0);
      const playback = audio.createBufferSource(); playback.buffer = buffer; playback.connect(audio.destination); this.playback = playback;
      const finished = new Promise<void>(resolve => {
        this.finishPlayback = resolve;
        playback.onended = () => { this.playback = undefined; this.finishPlayback = undefined; resolve(); };
      });
      playback.start();
      if (cue) this.emit({ type: 'step', ...cue, durationMs: pcm.length / sampleRate * 1000 });
      timings.firstAudible ??= performance.now()-ended + audio.baseLatency*1000;
      // Scheduling estimate includes reported audio latency, not an acoustic measurement.
      this.emit({ type: 'timing', timings: { ...timings } });
      // Compute the next sentence/step during playback, keeping one model call in flight.
      if (index + 1 < segments.length) {
        prepared = prepare(segments[index+1].text);
        void prepared.catch(() => {}); // observed even if stop() ends playback before the next await
      }
      await finished;
      if (!this.gate.current(turn)) return;
    }
  }
}
