import { expect, it } from 'vitest';
import { generationSchema, knowledgeResponseSchema, validateReply, type KnowledgeReply } from '../src/tutor/schema';
import { instructionSummary } from '../src/tutor/summary';
const reply: KnowledgeReply = { spoken: 'First put the ingredient on a chopping board, then chop it.', summary: 'On a chopping board: put it down with Cross, then chop with Square.', found: true, actionId: 'chop', jargon: null, steps: [
  {action:'press',controlId:'cross',say:'Put it down on the board.'},
  {action:'press',controlId:'square',say:'Press Square to chop.'},
] };
it('uses separately validated display copy and requests it from both local and remote models',()=>{
  expect(instructionSummary(validateReply(reply))).toBe(reply.summary);
  expect(reply.summary).not.toBe(reply.spoken);
  expect(knowledgeResponseSchema.required).toContain('summary');
  expect(generationSchema([])).toMatchObject({required:expect.arrayContaining(['summary'])});
});
it('rejects malformed or overlong summaries before any reply can be executed or spoken',()=>{
  for(const summary of ['', '   ', 'a'.repeat(161), 12, {}, null]) expect(()=>validateReply({...reply,summary})).toThrow('summary');
});
it('keeps older host replies working with a short control checklist instead of copied narration',()=>{
  const legacy={...reply};delete legacy.summary;
  expect(instructionSummary(validateReply(legacy))).toBe('Press Cross → Press Square');
  expect(instructionSummary(validateReply({spoken:'Here is the stick.',action:'tilt',controlId:'left-stick'}))).toBe('Tilt Left stick');
});
it('retains hold, direction and repetition in fallback instructions',()=>{
  const legacy:KnowledgeReply={...reply,summary:undefined,steps:[
    {action:'squeeze',controlId:'l2',hold:true,say:'Keep aiming.'},
    {action:'tilt',controlId:'left-stick',direction:'up',say:'Move forward.'},
    {action:'press',controlId:'cross',times:2,say:'Double press.'},
  ]};
  expect(instructionSummary(validateReply(legacy))).toBe('Hold L2 → Tilt Left stick up → Press Cross ×2');
});
