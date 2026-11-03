import { byId } from '../controller/facts';
import { replySteps, type TutorReply, type TutorStep } from './schema';

/** Display copy is independent of narration. The fallback uses validated inputs, never slices speech. */
export function instructionSummary(reply: TutorReply): string {
  if (reply.summary) return reply.summary.trim();
  const steps = replySteps(reply);
  if (!steps.length) return 'jargon' in reply && reply.jargon ? `Learn what “${reply.jargon.term}” means.` : 'Ask about a controller input or clarify the action you need.';
  return steps.map(compactStep).join(' → ');
}
function compactStep(step: TutorStep): string {
  const control = byId.get(step.controlId)!.label;
  const times = step.times && step.times > 1 ? ` ×${step.times}` : '';
  switch (step.action) {
    case 'highlight': return `Find ${control}`;
    case 'tilt': return `${step.hold ? 'Hold' : 'Tilt'} ${control}${step.direction ? ` ${step.direction}` : ''}`;
    case 'squeeze': return `${step.hold ? 'Hold' : 'Squeeze'} ${control}${times}`;
    case 'press': return `${step.hold ? 'Hold' : 'Press'} ${control}${times}`;
  }
}
