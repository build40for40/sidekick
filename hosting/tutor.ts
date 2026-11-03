import { createProviderRegistry, createGateway, generateText, jsonSchema, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { knowledgeResponseSchema, validateReply, type KnowledgeReply } from '../src/tutor/schema';
import type { TutorMessage } from '../src/tutor/knowledge';

export interface TutorEnv {
  /** Comma-separated provider:model IDs; empty means remote inference is disabled. */
  TUTOR_MODELS?: string;
  TUTOR_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  AI_GATEWAY_API_KEY?: string;
  COMPATIBLE_BASE_URL?: string;
  COMPATIBLE_API_KEY?: string;
}
export function resolveLanguageModel(env: TutorEnv, id: string) {
  const providers: Parameters<typeof createProviderRegistry>[0] = {};
  if (env.OPENAI_API_KEY) providers.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  if (env.ANTHROPIC_API_KEY) providers.anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) providers.google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  if (env.AI_GATEWAY_API_KEY) providers.gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
  if (env.COMPATIBLE_BASE_URL) providers.compatible = createOpenAICompatible({ name: 'compatible', baseURL: env.COMPATIBLE_BASE_URL, apiKey: env.COMPATIBLE_API_KEY });
  if (!/^[a-z][a-z0-9-]*:[^\s]+$/.test(id)) throw Error('Invalid model identifier.');
  return createProviderRegistry(providers).languageModel(id as `${string}:${string}`);
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
/** Public model IDs only; provider keys and endpoints are never returned. */
export function handleModelCatalog(request: Request, env: TutorEnv): Response {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const allowed = [...new Set(env.TUTOR_MODELS?.split(',').map(id => id.trim()).filter(Boolean) ?? [])];
  const models = env.TUTOR_RATE_LIMITER ? allowed.filter(id => {
    try { resolveLanguageModel(env, id); return true; } catch { return false; }
  }).slice(0, 100).map(model => ({ mode: 'remote', model, endpoint: '/sidekick/api/tutor' })) : [];
  return json({ models });
}
const maxBytes = 64 * 1024;
async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw Error('Empty body.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error('Request too large.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}
function validMessages(value: unknown): value is TutorMessage[] {
  if (!Array.isArray(value) || ![2,4].includes(value.length)) return false;
  const roles = value.length === 2 ? ['system','user'] : ['system','user','assistant','user'];
  return value.every((message, index) => message && Object.keys(message).length === 2 && message.role === roles[index] && typeof message.content === 'string' && !!message.content.trim() && message.content.length <= (index === 0 ? 48000 : message.role === 'user' ? 1200 : 8000));
}

export async function handleTutor(request: Request, env: TutorEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin) return json({ error: 'Same-origin requests required.' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'JSON required.' }, 415);
  const allowed = env.TUTOR_MODELS?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
  if (!allowed.length || !env.TUTOR_RATE_LIMITER) return json({ error: 'Remote tutor is not configured.' }, 503);
  const ip = request.headers.get('CF-Connecting-IP') ?? (['localhost','127.0.0.1'].includes(new URL(request.url).hostname) ? 'local' : null);
  if (!ip) return json({ error: 'Client address unavailable.' }, 403);
  try {
    if (!(await env.TUTOR_RATE_LIMITER.limit({ key: ip })).success) return json({ error: 'Request limit reached.' }, 429);
  } catch { return json({ error: 'Request limiter unavailable.' }, 503); }
  let body: { model?: unknown; messages?: unknown };
  try { body = await readBody(request) as typeof body; }
  catch { return json({ error: 'Invalid or oversized request.' }, 400); }
  if (!body || typeof body.model !== 'string' || !allowed.includes(body.model) || !validMessages(body.messages)) return json({ error: 'Invalid tutor request or model.' }, 400);
  let model: ReturnType<typeof resolveLanguageModel>;
  try { model = resolveLanguageModel(env, body.model); }
  catch { return json({ error: 'Provider is not configured.' }, 503); }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 40000);
  try {
    const result = await generateText({
      model, instructions: body.messages[0].content,
      messages: body.messages.slice(1).map(({ role, content }) => ({ role: role as 'user' | 'assistant', content })), maxOutputTokens: 1200, maxRetries: 0,
      abortSignal: AbortSignal.any([request.signal, timeout.signal]),
      // Existing optional step fields need non-strict OpenAI JSON schema support.
      providerOptions: {
        openai: { strictJsonSchema: false, store: false },
        ...(body.model === 'anthropic:claude-sonnet-5-5' ? { anthropic: { thinking: { type: 'between_tools' }, effort: 'low' } } : {}),
      },
      output: Output.object({ schema: jsonSchema<KnowledgeReply>(knowledgeResponseSchema as Parameters<typeof jsonSchema>[0], {
        validate: value => {
          try {
            const reply = validateReply(value);
            if (!('steps' in reply)) throw Error('Knowledge answer required.');
            return { success: true, value: reply };
          } catch { return { success: false, error: Error('Invalid tutor answer.') }; }
        },
      }) }),
    });
    // Independent validation remains mandatory even when a provider promises structured output.
    const reply = validateReply(result.output);
    if (!('steps' in reply)) throw Error('Knowledge answer required.');
    return json({ reply, stats: { promptTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 } });
  } catch { return json({ error: timeout.signal.aborted ? 'Remote tutor timed out.' : 'Remote tutor failed to produce a valid answer.' }, timeout.signal.aborted ? 504 : 502); }
  finally { clearTimeout(timer); }
}
