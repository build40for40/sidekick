import cases from './cases.json';
import type { Sidekick } from '../src/index';
import { replySteps, type TutorReply } from '../src/tutor/schema';
export type EvaluationCase = typeof cases[number];
export function compareReply(test: EvaluationCase, reply: TutorReply): string[] {
  const failures: string[] = [];
  const steps = replySteps(reply);
  if (test.expected) {
    if (!('found' in reply)) return ['Expected a knowledge answer'];
    if (reply.found !== test.expected.found) failures.push('found');
    if (reply.actionId !== test.expected.actionId) failures.push('actionId');
    const inputs = (list: typeof steps) => list.map(s => ({ action:s.action,controlId:s.controlId,hold:s.hold ?? false,times:s.times ?? 1,direction:s.direction ?? null }));
    if (JSON.stringify(inputs(steps)) !== JSON.stringify(inputs(test.expected.steps as typeof steps))) failures.push('input sequence');
    if ((reply.jargon?.term.toLowerCase() ?? null) !== (test.expected.jargon?.term.toLowerCase() ?? null)) failures.push('jargon term');
  } else {
    if (!test.actions?.includes(steps[0]?.action ?? 'none')) failures.push('action');
    if (steps.length && test.controlId && steps[0].controlId !== test.controlId) failures.push('controlId');
  }
  return failures;
}
/** Dev-server helper. Requires explicit model consent/initialization by the host first. Never runs fixtures. */
export async function runEvaluation(tutor: Sidekick) {
  if (tutor.getState().mode !== 'local') throw Error('Initialize real local models before evaluating. Fixture results are not model results.');
  const results: { id: string; elapsedMs: number; failures: string[]; reply?: TutorReply; error?: string }[] = [];
  for (const test of cases) {
    tutor.setGame(test.game ?? null);
    const started = performance.now();
    try {
      const reply = await new Promise<TutorReply>((resolve,reject) => {
        const timer = setTimeout(() => { off(); reject(Error('Model reply timed out.')); },120000);
        const off = tutor.on(event => {
          if (event.type === 'reply' || event.type === 'error' || event.type === 'destroyed') {
            clearTimeout(timer); off();
            if (event.type === 'reply') resolve(event.reply);
            else reject(Error(event.type === 'error' ? event.message : 'Tutor destroyed.'));
          }
        });
        try { tutor.ask(test.prompt); } catch (error) { clearTimeout(timer); off(); reject(error); }
      });
      results.push({ id:test.id,elapsedMs:performance.now()-started,failures:compareReply(test,reply),reply });
    } catch (error) { results.push({ id:test.id,elapsedMs:performance.now()-started,failures:['generation/validation'],error:String(error) }); }
    // Isolate model quality from speech and endless animation; assess voice separately.
    tutor.stop();
  }
  tutor.setGame(null);
  return results;
}
