/** Capture mono PCM directly, avoiding MediaRecorder encoding and decodeAudioData.
 * The worklet uses the playback context rate; Web Audio resamples once at finish. */
import workletUrl from './capture.worklet.js?url&no-inline';
export class PCMCapture {
  private static modules = new WeakMap<AudioContext, Promise<void>>();
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private chunks: Float32Array[] = [];
  private stopped = false;
  private finish?: (value: Float32Array) => void;
  private timeout?: ReturnType<typeof setTimeout>;
  private finishing = false;
  constructor(private audio: AudioContext) {}
  async start(stream: MediaStream) {
    let module = PCMCapture.modules.get(this.audio);
    if (!module) {
      module = this.audio.audioWorklet.addModule(workletUrl).catch(error => { PCMCapture.modules.delete(this.audio); throw error; });
      PCMCapture.modules.set(this.audio, module);
    }
    await module;
    if (this.stopped) return;
    this.source = this.audio.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.audio, 'sidekick-capture', { outputChannelCount: [1] });
    this.node.onprocessorerror = () => this.dispose();
    this.node.port.onmessage = ({ data }) => {
      if (data === 'finished') {
        const size = this.chunks.reduce((n, chunk) => n + chunk.length, 0);
        const pcm = new Float32Array(size); let offset = 0;
        for (const chunk of this.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
        this.finish?.(pcm); this.dispose();
      } else if (!this.stopped) this.chunks.push(data);
    };
    this.source.connect(this.node); this.node.connect(this.audio.destination);
  }
  stop(): Promise<Float32Array> {
    return new Promise(resolve => {
      if (!this.node || this.stopped || this.finishing) { resolve(new Float32Array()); return; }
      this.finishing = true;
      this.finish = resolve;
      this.timeout = setTimeout(() => this.dispose(), 2000);
      // Disconnect input before flushing; queued messages precede the acknowledgement.
      this.source?.disconnect(); this.node.port.postMessage('finish');
    });
  }
  dispose() {
    clearTimeout(this.timeout);
    this.stopped = true; this.source?.disconnect(); this.node?.disconnect();
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); }
    this.node = undefined; this.chunks = []; this.finish?.(new Float32Array()); this.finish = undefined;
  }
}
