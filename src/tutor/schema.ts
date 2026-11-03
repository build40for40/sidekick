import { byId, controls, sequences, sequenceById } from '../controller/manifest';
export const actions = ['none', 'highlight', 'press', 'tilt', 'squeeze', 'sequence'] as const;
export interface TutorReply { spoken: string; action: typeof actions[number]; controlId?: string; sequenceId?: string; exercise?: 'find' | 'click' | 'practise' }
const spokenProperty = { type: 'string', minLength: 1, maxLength: 420 };
export const responseSchema = {
  anyOf: [
    { type: 'object', properties: { spoken: spokenProperty, action: { const: 'none' } }, required: ['spoken','action'], additionalProperties: false },
    { type: 'object', properties: { spoken: spokenProperty, action: { const: 'sequence' }, sequenceId: { type: 'string', enum: sequences.map(s => s.id) } }, required: ['spoken','action','sequenceId'], additionalProperties: false },
    { type: 'object', properties: {
      spoken: spokenProperty, action: { type: 'string', enum: ['highlight','press','tilt','squeeze'] },
      controlId: { type: 'string', enum: controls.map(c => c.id) },
      exercise: { type: 'string', enum: ['find','click','practise'] },
    }, required: ['spoken','action','controlId'], additionalProperties: false },
  ],
};
export function validateReply(raw: unknown): TutorReply {
  const x = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('Tutor returned an invalid response. Try again.');
  if (Object.keys(x).some(k => !['spoken','action','controlId','sequenceId','exercise'].includes(k)) || typeof x.spoken !== 'string' || !x.spoken.trim() || x.spoken.length > 420 || !actions.includes(x.action)) throw Error('Tutor returned an invalid response. Try again.');
  if (x.action === 'sequence') {
    if (typeof x.sequenceId !== 'string' || !sequenceById.has(x.sequenceId) || x.controlId !== undefined || x.exercise !== undefined) throw Error('Tutor requested an unknown move.');
    return x as TutorReply;
  }
  if (x.sequenceId !== undefined) throw Error('Tutor returned an invalid response. Try again.');
  if (x.controlId !== undefined && (typeof x.controlId !== 'string' || !byId.has(x.controlId))) throw Error('Tutor requested an unknown control.');
  if (x.action !== 'none' && !x.controlId) throw Error('Tutor action needs a control.');
  if (x.exercise !== undefined && !['find','click','practise'].includes(x.exercise)) throw Error('Unsupported exercise.');
  if (x.exercise && !x.controlId) throw Error('Exercise needs a control.');
  const c = byId.get(x.controlId);
  if ((x.action === 'tilt' && c?.motion !== 'stick') || (x.action === 'squeeze' && c?.motion !== 'trigger')) throw Error('Unsupported movement for this control.');
  return x as TutorReply;
}
