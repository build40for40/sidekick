import { afterEach, expect, it, vi } from 'vitest';
import { RemoteGenerator, inferenceOptions } from '../src/voice/remote';
import { KnowledgeTutor, type KnowledgePack } from '../src/tutor/knowledge';
const options = { mode: 'remote' as const, endpoint: 'https://example.com/sidekick/api/tutor', model: 'anthropic:test' };
const messages = [{ role: 'user' as const, content: 'Hello' }];
const reply = { spoken: 'Which game?', found: false, actionId: null, steps: [], jargon: null };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('requires explicit valid same-origin configuration', () => {
  vi.stubGlobal('location', new URL('https://example.com/sidekick/'));
  expect(inferenceOptions()).toEqual({ mode: 'local' });
  expect(inferenceOptions({ ...options, endpoint: './api/tutor' })).toEqual(options);
  expect(() => inferenceOptions({ ...options, endpoint: 'https://other.com/tutor' })).toThrow('same-origin');
  expect(() => inferenceOptions({ ...options, model: 'invalid' })).toThrow('Invalid');
});
it('sends text context with cancellation and reports remote usage', async () => {
  const fetch = vi.fn(async () => Response.json({ reply, stats: { promptTokens: 15, outputTokens: 20 } }));
  vi.stubGlobal('fetch', fetch);
  const remote = new RemoteGenerator(options);
  expect(await remote.generate(messages)).toEqual(reply);
  const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(request[1].body as string)).toEqual({ model: options.model, messages });
  expect(request[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', signal: expect.any(AbortSignal) });
  expect(remote.stats).toEqual({ promptTokens: 15, outputTokens: 20 });
  remote.dispose(); await expect(remote.generate(messages)).rejects.toThrow('stopped');
});
it.each(['interrupt','dispose'] as const)('rejects late responses after %s even if transport ignores cancellation', async method => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const remote = new RemoteGenerator(options);
  const pending = remote.generate(messages); const rejected = expect(pending).rejects.toThrow('cancelled');
  remote[method](); finish(Response.json({ reply })); await rejected;
});
it('times out remote generation and never falls back to another model', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('aborted')))));
  vi.stubGlobal('fetch', fetch);
  const remote = new RemoteGenerator(options);
  const rejected = expect(remote.generate(messages)).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(45000); await rejected; expect(fetch).toHaveBeenCalledOnce();
});
it('preserves knowledge validation before accepting remote steps or conversation history', async () => {
  const pack: KnowledgePack = { prompt: 'Use supplied facts.', activeGame: 'test', games: [] };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ reply: { ...reply, found: true, actionId: 'invented', steps: [] } })).mockResolvedValue(Response.json({ reply }));
  vi.stubGlobal('fetch', fetch);
  const remote = new RemoteGenerator(options), tutor = new KnowledgeTutor(pack, messages => remote.generate(messages));
  await expect(tutor.reply('Jump')).rejects.toThrow('unavailable');
  await tutor.reply('Help');
  expect(JSON.parse(fetch.mock.calls[1][1].body).messages).toHaveLength(2);
});
it('reports rate limits without speaking provider error bodies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('sensitive error', { status: 429 })));
  await expect(new RemoteGenerator(options).generate(messages)).rejects.toThrow('request limit');
});
