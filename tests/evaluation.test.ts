import { expect, it } from 'vitest';
import cases from '../evaluation/cases.json';
import { developmentReply } from '../src/tutor/development';
import { validateReply } from '../src/tutor/schema';
// This checks only the labelled fixture, not the quality of local model output.
it.each(cases.filter(test => !test.game))('development fixture: $id',test=> {
  const reply=validateReply(developmentReply(test.prompt));
  if (!('action' in reply)) throw Error('Expected controller fixture.');
  expect(test.actions).toContain(reply.action);
  if(reply.action!=='none' && test.controlId) expect(reply.controlId).toBe(test.controlId);
  if(test.exercise) expect(reply.exercise).toBe(test.exercise);
});
