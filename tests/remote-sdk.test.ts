import { afterEach, expect, it, vi } from 'vitest';
import { handleTutor } from '../hosting/tutor';
afterEach(()=>vi.unstubAllGlobals());
it('runs real AI SDK generation against a simulated OpenAI Responses API and validates the completed JSON',async()=>{
  const reply={spoken:'Which game?',found:false,actionId:null,steps:[],jargon:null};
  const fetch=vi.fn(async()=>Response.json({
    id:'resp_test',created_at:1,model:'test',status:'completed',
    output:[{id:'msg_test',type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(reply),annotations:[]}]}],
    usage:{input_tokens:20,output_tokens:30,total_tokens:50},
  }));
  vi.stubGlobal('fetch',fetch);
  const response=await handleTutor(new Request('https://example.com/sidekick/api/tutor',{
    method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},
    body:JSON.stringify({model:'openai:test',messages:[{role:'system',content:'Use controller facts.'},{role:'user',content:'Help'}]}),
  }),{TUTOR_MODELS:'openai:test',OPENAI_API_KEY:'fixture-key',TUTOR_RATE_LIMITER:{limit:async()=>({success:true})}});
  expect(response.status).toBe(200);expect(await response.json()).toEqual({reply,stats:{promptTokens:20,outputTokens:30}});
  expect(fetch).toHaveBeenCalledOnce();
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://api.openai.com/v1/responses');
  const body=JSON.parse(init.body as string);
  expect(body).toMatchObject({model:'test',store:false,max_output_tokens:1200,text:{format:{type:'json_schema',strict:false}}});
  expect(body.text.format.schema.properties.steps).toBeDefined();
});
it('uses Sonnet 5.5 native JSON output without upfront thinking or forced tools',async()=>{
  const reply={spoken:'L3 is the left stick clicked in.',summary:'Press the left stick straight down (L3).',found:true,actionId:null,steps:[{action:'press',controlId:'left-stick',say:'Click the left stick straight down.'}],jargon:null};
  const fetch=vi.fn(async()=>Response.json({
    id:'msg_fixture',type:'message',role:'assistant',model:'claude-sonnet-5-5',content:[{type:'text',text:JSON.stringify(reply)}],
    stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:20,output_tokens:30},
  }));vi.stubGlobal('fetch',fetch);
  const response=await handleTutor(new Request('https://example.com/sidekick/api/tutor',{
    method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},
    body:JSON.stringify({model:'anthropic:claude-sonnet-5-5',messages:[{role:'system',content:'Use supplied controller facts.'},{role:'user',content:'Where is L3?'}]}),
  }),{TUTOR_MODELS:'anthropic:claude-sonnet-5-5',ANTHROPIC_API_KEY:'fixture-key',TUTOR_RATE_LIMITER:{limit:async()=>({success:true})}});
  expect(response.status).toBe(200);expect(await response.json()).toEqual({reply,stats:{promptTokens:20,outputTokens:30}});
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://api.anthropic.com/v1/messages');
  const body=JSON.parse(init.body as string);
  expect(body).toMatchObject({model:'claude-sonnet-5-5',thinking:{type:'between_tools'},max_tokens:1200,output_config:{effort:'low',format:{type:'json_schema'}}});
  expect(body.temperature).toBeUndefined();expect(body.tool_choice).toBeUndefined();
});
