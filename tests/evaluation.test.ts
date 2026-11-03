import { expect, it } from 'vitest';
import cases from '../evaluation/cases.json';
import { developmentReply } from '../src/tutor/development';
import { validateReply } from '../src/tutor/schema';
// This checks only the labelled fixture, not the quality of local model output.
it.each(cases)('development fixture: $id',test=> {
  const reply=validateReply(developmentReply(test.prompt));
  expect(test.actions).toContain(reply.action);
  if(reply.action!=='none' && test.controlId) expect(reply.controlId).toBe(test.controlId);
  if(test.exercise) expect(reply.exercise).toBe(test.exercise);
});
