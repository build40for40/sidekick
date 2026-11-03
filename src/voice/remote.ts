import type { TutorMessage } from '../tutor/knowledge';
import type { GenerationStats } from './types';

export interface RemoteInferenceOptions {
  mode: 'remote';
  /** Same-origin backend endpoint. Provider credentials belong on the server. */
  endpoint: string;
  /** Server-allowlisted provider:model identifier. */
  model: string;
}
export type InferenceOptions = { mode: 'local' } | RemoteInferenceOptions;
export function inferenceOptions(options: InferenceOptions = { mode: 'local' }): InferenceOptions {
  if (options.mode === 'local') return { mode: 'local' };
  if (options.mode !== 'remote' || typeof options.endpoint !== 'string' || !options.endpoint.trim() || typeof options.model !== 'string' || !/^[a-z][a-z0-9-]*:[^\s]+$/.test(options.model) || options.model.length > 200) throw Error('Invalid inference options.');
  return { mode: 'remote', endpoint: sameOriginEndpoint(options.endpoint), model: options.model };
}
/** Shared URL policy for generation and public model metadata. */
export function sameOriginEndpoint(endpoint: string): string {
  if (typeof endpoint !== 'string' || !endpoint.trim()) throw Error('Invalid endpoint.');
  // Use same-origin cookies for host authentication; never send transcripts to arbitrary URL schemes/origins.
  const url = new URL(endpoint, location.href);
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw Error('Remote tutor endpoint must be a same-origin HTTP(S) URL.');
  return url.href;
}

/** Transport only. KnowledgeTutor independently validates and commits the completed answer. */
export class RemoteGenerator {
  private active?: AbortController;
  private revision = 0;
  private stopped = false;
  stats?: GenerationStats;
  constructor(private options: RemoteInferenceOptions) {}
  async generate(messages: TutorMessage[]): Promise<unknown> {
    if (this.stopped) throw Error('Remote tutor stopped.');
    const controller = new AbortController(), revision = this.revision;
    this.active = controller;
    this.stats = undefined;
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.options.model, messages }),
      });
      if (!response.ok) throw Error(response.status === 429 ? 'Remote tutor request limit reached. Please try again later.' : `Remote tutor request failed (${response.status}).`);
      const result = await response.json();
      if (controller.signal.aborted || revision !== this.revision || this.stopped) throw Error('Tutor turn cancelled.');
      if (result?.stats && Number.isFinite(result.stats.promptTokens) && Number.isFinite(result.stats.outputTokens)) this.stats = { promptTokens: result.stats.promptTokens, outputTokens: result.stats.outputTokens };
      return result?.reply;
    } catch (error) {
      if (controller.signal.aborted) throw Error(revision !== this.revision || this.stopped ? 'Tutor turn cancelled.' : 'Remote tutor timed out. Please try again.');
      throw error;
    } finally { clearTimeout(timeout); if (this.active === controller) this.active = undefined; }
  }
  interrupt() { this.revision++; this.active?.abort(); }
  dispose() { this.stopped = true; this.interrupt(); }
}
