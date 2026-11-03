import { transitionPhase } from './machine';
import { TurnGate } from './turn';
import type { Phase, VoiceAdapters, VoiceEvent, Timings } from './types';
import { validateReply } from '../tutor/schema';
import { developmentReply } from '../tutor/development';
export class VoiceOrchestrator {
  private gate = new TurnGate();
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private audio?: AudioContext;
  private playback?: AudioBufferSourceNode;
  private timer?: ReturnType<typeof setTimeout>;
  private queue = Promise.resolve();
  private lastSpoken = '';
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
    if (this.playback) { this.playback.onended = null; try { this.playback.stop(); } catch { /* already stopped */ } this.playback = undefined; }
    if (this.recorder?.state === 'recording') { this.recorder.onstop = null; this.recorder.stop(); }
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
    clearTimeout(this.timer); this.state('ready');
  }
  dispose() { this.stop(); void this.audio?.close(); this.audio = undefined; }
  async startRecording() {
    if (!this.adapters) { this.fail(Error('Download local voice models first. The host can also provide a text question.')); return; }
    this.stop(); this.unlockAudio();
    const turn = this.gate.next();
    this.state('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!this.gate.current(turn)) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const recorder = new MediaRecorder(stream); this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { if (this.gate.current(turn)) { this.stop(); this.fail(Error('Recording failed. Please try again.')); } };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); clearTimeout(this.timer);
        if (!this.gate.current(turn)) return;
        const ended = performance.now(); this.state('transcribing');
        this.enqueue(turn, async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          if (blob.size < 100) throw Error('No audio was recorded. Try again or type a question.');
          const decoded = await this.audio!.decodeAudioData(await blob.arrayBuffer());
          if (!this.gate.current(turn)) return;
          const offline = new OfflineAudioContext(1, Math.max(1,Math.ceil(decoded.duration*16000)), 16000);
          const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
          const pcm = (await offline.startRendering()).getChannelData(0);
          const rms = Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);
          if (pcm.length < 3200 || rms < .002) throw Error('That recording was quiet or too short. Try again or type a question.');
          if (!this.gate.current(turn)) return;
          const t = performance.now();
          const text = (await this.adapters!.recognition.transcribe(pcm)).trim();
          if (!this.gate.current(turn)) return;
          if (!text || /^\[.*\]$/.test(text)) throw Error('No speech recognised. Try again or type a question.');
          this.emit({ type: 'transcript', text });
          await this.generate(text, turn, ended, performance.now()-t);
        });
      };
      recorder.start(); this.timer = setTimeout(() => this.finishRecording(), 30000);
    } catch (error) {
      if (this.gate.current(turn)) { this.stop(); this.fail(error instanceof DOMException && error.name === 'NotAllowedError' ? Error('Microphone permission was denied. Allow it in Chrome’s site settings and try again, or use the host’s text input.') : error); }
    }
  }
  finishRecording() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    else if (this.phase === 'listening') this.stop();
  }
  ask(text: string) {
    if (!text.trim()) return;
    this.stop(); this.unlockAudio(); const turn = this.gate.next();
    this.emit({ type: 'transcript', text }); this.state('thinking');
    this.enqueue(turn, () => this.generate(text, turn, performance.now(), 0));
  }
  private enqueue(turn: number, operation: () => Promise<void>) {
    this.queue = this.queue.then(async () => { if (this.gate.current(turn)) await operation(); }).catch(error => { if (this.gate.current(turn)) this.fail(error); });
  }
  private async generate(text: string, turn: number, ended: number, transcription: number) {
    if (!this.gate.current(turn)) return;
    this.state('thinking'); const t = performance.now();
    const reply = validateReply(this.adapters ? await this.adapters.tutor.reply(text) : developmentReply(text));
    if (!this.gate.current(turn)) return;
    this.emit({ type: 'reply', reply }); this.lastSpoken = reply.spoken;
    const timings: Timings = { transcription, generation: performance.now()-t, synthesis: 0 };
    if (this.adapters) await this.speak(reply.spoken, turn, timings, ended);
    else this.state('ready');
  }
  repeat() {
    if (!this.lastSpoken || !this.adapters) return;
    this.stop(); this.unlockAudio(); const turn = this.gate.next(); this.state('speaking');
    this.enqueue(turn, () => this.speak(this.lastSpoken, turn, { transcription: 0, generation: 0, synthesis: 0 }, performance.now()));
  }
  private async speak(text: string, turn: number, timings: Timings, ended: number) {
    if (!this.gate.current(turn)) return;
    this.state('speaking'); const t = performance.now();
    const { pcm, sampleRate } = await this.adapters!.synthesis.synthesize(text);
    if (!this.gate.current(turn)) return;
    timings.synthesis = performance.now()-t;
    const audio = this.audio!;
    if (audio.state !== 'running') throw Error('Audio playback is paused by the browser. Click Repeat to allow playback.');
    const buffer = audio.createBuffer(1, pcm.length, sampleRate); buffer.copyToChannel(new Float32Array(pcm),0);
    const playback = audio.createBufferSource(); playback.buffer = buffer; playback.connect(audio.destination); this.playback = playback;
    playback.onended = () => { if (this.gate.current(turn)) this.state('ready'); };
    playback.start(); timings.firstAudible = performance.now()-ended + audio.baseLatency*1000;
    // Scheduling estimate includes reported audio latency, not an acoustic measurement.
    this.emit({ type: 'timing', timings });
  }
}
