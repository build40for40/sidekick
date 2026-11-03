// Output is always silent: microphone samples are never routed to the speakers.
class SidekickCapture extends AudioWorkletProcessor {
  samples = new Float32Array(2048);
  used = 0;
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] / channels.length;
      this.samples[this.used++] = mono;
      if (this.used === this.samples.length) {
        this.port.postMessage(this.samples, [this.samples.buffer]);
        this.samples = new Float32Array(2048); this.used = 0;
      }
    }
    return true;
  }
  constructor() {
    super();
    this.port.onmessage = () => {
      if (this.used) this.port.postMessage(this.samples.slice(0, this.used));
      this.port.postMessage('finished');
    };
  }
}
registerProcessor('sidekick-capture', SidekickCapture);
