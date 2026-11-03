import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('ai',async original=>({...await original<typeof import('ai')>(),generateText:mocks.generate}));
import worker from '../hosting/worker';
import { handleTutor, resolveLanguageModel, type TutorEnv } from '../hosting/tutor';
const reply={spoken:'Which game?',found:false,actionId:null,steps:[],jargon:null};
const payload={model:'openai:test',messages:[{role:'system',content:'Use supplied facts.'},{role:'user',content:'Help'}]};
const env=():TutorEnv=>({TUTOR_MODELS:'openai:test,anthropic:test',OPENAI_API_KEY:'test-key',TUTOR_RATE_LIMITER:{limit:vi.fn(async()=>({success:true}))}});
function request(body:unknown=payload,headers:Record<string,string>={}) {
  return new Request('https://example.com/sidekick/api/tutor',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body)});
}
beforeEach(()=>{mocks.generate.mockReset();mocks.generate.mockResolvedValue({output:reply,usage:{inputTokens:20,outputTokens:30}});});
afterEach(()=>vi.useRealTimers());
it('routes inference before static assets and uses the AI SDK with bounded output and no retries',async()=>{
  const response=await worker.fetch(request(),{...env(),ASSETS:{fetch:async()=>{throw Error('Unexpected asset');}}});
  expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({reply,stats:{promptTokens:20,outputTokens:30}});
  const call=mocks.generate.mock.calls[0][0];
  expect(call).toMatchObject({instructions:payload.messages[0].content,messages:payload.messages.slice(1),maxRetries:0,maxOutputTokens:1200});
  expect(call.model.modelId).toBe('test');expect(call.output).toBeDefined();expect(call.abortSignal).toBeInstanceOf(AbortSignal);
});
it('supports direct providers, gateway and compatible endpoints through the same registry',()=>{
  expect(resolveLanguageModel({ANTHROPIC_API_KEY:'test'},'anthropic:any-model').modelId).toBe('any-model');
  expect(resolveLanguageModel({GOOGLE_GENERATIVE_AI_API_KEY:'test'},'google:any-model').modelId).toBe('any-model');
  expect(resolveLanguageModel({AI_GATEWAY_API_KEY:'test'},'gateway:vendor/any-model').modelId).toBe('vendor/any-model');
  expect(resolveLanguageModel({COMPATIBLE_BASE_URL:'https://example.com/v1'},'compatible:any-model:version').modelId).toBe('any-model:version');
  expect(()=>resolveLanguageModel({},'openai:test')).toThrow();
});
it('requires explicit model configuration and a rate limiter',async()=>{
  expect((await handleTutor(request(),{})).status).toBe(503);
  expect((await handleTutor(request(),{TUTOR_MODELS:'openai:test',OPENAI_API_KEY:'test'})).status).toBe(503);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('rejects cross-origin requests and rate limits by client IP before inference',async()=>{
  const config=env();
  expect((await handleTutor(request(payload,{Origin:'https://other.com'}),config)).status).toBe(403);
  config.TUTOR_RATE_LIMITER!.limit=vi.fn(async()=>({success:false}));
  expect((await handleTutor(request(),config)).status).toBe(429);
  expect(config.TUTOR_RATE_LIMITER!.limit).toHaveBeenCalledWith({key:'192.0.2.1'});
  expect(mocks.generate).not.toHaveBeenCalled();
});
it.each([
  {...payload,model:'openai:expensive-unlisted'},
  {...payload,messages:[{role:'user',content:'Missing system context'}]},
  {...payload,messages:[payload.messages[0],{role:'user',content:'x'.repeat(1201)}]},
  {...payload,messages:[{role:'system',content:'x'.repeat(65000)},payload.messages[1]]},
  null,
])('rejects invalid, unlisted or oversized requests before spending tokens',async body=>{
  expect((await handleTutor(request(body),env())).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();
});
it('rejects malformed JSON, methods and content types',async()=>{
  expect((await handleTutor(new Request('https://example.com/sidekick/api/tutor'),env())).status).toBe(405);
  expect((await handleTutor(request(payload,{'Content-Type':'text/plain'}),env())).status).toBe(415);
  const malformed=new Request(request(),{body:'{'});
  expect((await handleTutor(malformed,env())).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();
});
it('validates output independently and hides provider errors',async()=>{
  mocks.generate.mockResolvedValueOnce({output:{...reply,found:true,steps:[{action:'press',controlId:'invented',say:'Press'}]},usage:{}});
  expect((await handleTutor(request(),env())).status).toBe(502);
  mocks.generate.mockRejectedValueOnce(Error('Provider error containing secret-key'));
  const response=await handleTutor(request(),env());expect(response.status).toBe(502);expect(await response.text()).not.toContain('secret-key');
});
it('aborts a slow provider request at the server deadline',async()=>{
  vi.useFakeTimers();
  mocks.generate.mockImplementation(({abortSignal})=>new Promise((_resolve,reject)=>abortSignal.addEventListener('abort',()=>reject(Error('aborted')))));
  const pending=handleTutor(request(),env());
  await vi.advanceTimersByTimeAsync(40000);expect((await pending).status).toBe(504);
});
it('publishes only configured allowlisted model IDs for settings, without exposing secrets',async()=>{
  const config={...env(),TUTOR_MODELS:'openai:test,anthropic:missing-key,openai:test,unknown:test'};
  const response=await worker.fetch(new Request('https://example.com/sidekick/api/models'),{...config,ASSETS:{fetch:async()=>{throw Error('Unexpected asset');}}});
  expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({models:[{mode:'remote',model:'openai:test',endpoint:'/sidekick/api/tutor'}]});
  expect(mocks.generate).not.toHaveBeenCalled();
});
it('offers no remote models until inference is configured and refuses catalog mutation',async()=>{
  const assets={fetch:async()=>{throw Error('Unexpected asset');}};
  expect(await (await worker.fetch(new Request('https://example.com/sidekick/api/models'),{ASSETS:assets})).json()).toEqual({models:[]});
  expect((await worker.fetch(new Request('https://example.com/sidekick/api/models',{method:'POST'}),{...env(),ASSETS:assets})).status).toBe(405);
});
