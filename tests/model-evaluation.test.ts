import { expect, it } from 'vitest';
import cases from '../evaluation/cases.json';
import { compareReply, runEvaluation } from '../evaluation/run';
import type { Sidekick, TutorReply } from '../src/index';
it('compares real structured replies with gold input semantics, independently of wording', () => {
  const test = cases.find(c => c.game === 'overcooked2' && c.expected?.actionId === 'chop')!;
  const reply = structuredClone(test.expected!) as TutorReply;
  reply.spoken = 'Here are the chopping controls.';
  expect(compareReply(test,reply)).toEqual([]);
  if (!('steps' in reply)) throw Error('Expected steps');
  reply.steps.reverse(); expect(compareReply(test,reply)).toContain('input sequence');
  reply.found = false; expect(compareReply(test,reply)).toContain('found');
});
it('refuses to report fixture runs as model evaluations', async () => {
  await expect(runEvaluation({ getState: () => ({ mode:'development' }) } as Sidekick)).rejects.toThrow('real local models');
});
