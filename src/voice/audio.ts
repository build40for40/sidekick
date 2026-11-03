/** Trim only edge silence in 20ms frames, keeping 200ms context for quiet consonants.
 * This is an energy gate, not a speech detector. Internal pauses are preserved. */
export function trimSilence(pcm: Float32Array, sampleRate = 16000): Float32Array {
  const frame = Math.round(sampleRate * .02), pad = Math.round(sampleRate * .2);
  let first = -1, last = 0;
  for (let i = 0; i < pcm.length; i += frame) {
    const end = Math.min(i + frame, pcm.length);
    let energy = 0;
    for (let j = i; j < end; j++) energy += pcm[j] * pcm[j];
    if (Math.sqrt(energy / (end - i)) >= .002) { if (first < 0) first = i; last = end; }
  }
  if (first < 0 || pcm.length < sampleRate * .2) throw Error('That recording was quiet or too short. Try again or type a question.');
  return pcm.slice(Math.max(0, first - pad), Math.min(pcm.length, last + pad));
}
/** Split validated prose into sentences. Keep abbreviations/decimal numbers together. */
export function speechSentences(text: string): string[] {
  if (typeof Intl.Segmenter === 'undefined') return [text];
  return Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text), part => part.segment.trim()).filter(Boolean);
}
