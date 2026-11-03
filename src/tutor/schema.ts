import { byId, controls } from '../controller/facts';
import packSchema from '../../knowledge/output-schema.json';
export const actions = ['none', 'highlight', 'press', 'tilt', 'squeeze'] as const;
export interface ControllerReply { spoken: string; summary?: string; action: typeof actions[number]; controlId?: string; exercise?: 'find' | 'click' | 'practise' }
export interface TutorStep {
  action: Exclude<typeof actions[number], 'none'>; controlId: string; say: string;
  hold?: boolean; times?: number; direction?: 'up' | 'down' | 'left' | 'right';
}
export interface KnowledgeReply { spoken: string; summary?: string; found: boolean; actionId: string | null; steps: TutorStep[]; jargon: { term: string; means: string } | null }
export type TutorReply = ControllerReply | KnowledgeReply;
export const knowledgeResponseSchema = packSchema;
/** Constrain identifiers during decoding, rather than relying on small models to copy IDs. */
export function generationSchema(actionIds: readonly string[]) {
  const properties = {
    ...packSchema.properties,
    actionId: { enum: [null, ...actionIds] },
    steps: { ...packSchema.properties.steps, items: {
      ...packSchema.properties.steps.items,
      properties: { ...packSchema.properties.steps.items.properties, controlId: { type: 'string', enum: controls.map(c => c.id) } },
    } },
  };
  // Metadata is for human pack authors, not the decoder. One shape avoids expensive
  // union-grammar compilation; semantic conditions remain enforced by validateReply.
  const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !['description','title','$schema'].includes(key)).map(([key, item]) => [key,strip(item)])) : value;
  return strip({ type:'object', required:packSchema.required, additionalProperties:false, properties });
}
export function replySteps(reply: TutorReply): TutorStep[] {
  return 'steps' in reply ? reply.steps : reply.action === 'none' ? [] : [{ action: reply.action, controlId: reply.controlId!, say: reply.spoken }];
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && !!value.trim() && value.length <= max; }
export function validateStep(raw: unknown): TutorStep {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid tutor step.');
  const x = raw as Record<string, unknown>;
  if (Object.keys(x).some(k => !['action','controlId','say','hold','times','direction'].includes(k)) || !text(x.say,120) || typeof x.action !== 'string' || !['highlight','press','tilt','squeeze'].includes(x.action)) throw Error('Invalid tutor step.');
  const c = typeof x.controlId === 'string' ? byId.get(x.controlId) : undefined;
  if (!c) throw Error('Tutor requested an unknown control.');
  if ((x.action === 'tilt' && c.motion !== 'stick') || (x.action === 'squeeze' && c.motion !== 'trigger')) throw Error('Unsupported movement for this control.');
  if (x.hold !== undefined && typeof x.hold !== 'boolean') throw Error('Invalid hold.');
  if (x.times !== undefined && (!Number.isInteger(x.times) || Number(x.times) < 1 || Number(x.times) > 3)) throw Error('Invalid repetition count.');
  if (x.direction !== undefined && (x.action !== 'tilt' || typeof x.direction !== 'string' || !['up','down','left','right'].includes(x.direction))) throw Error('Invalid tilt direction.');
  return x as unknown as TutorStep;
}
const summaryProperty = { type: 'string', minLength: 1, maxLength: 160 };
const spokenProperty = { type: 'string', minLength: 1, maxLength: 420 };
export const responseSchema = {
  anyOf: [
    { type: 'object', properties: { spoken: spokenProperty, summary: summaryProperty, action: { const: 'none' } }, required: ['spoken','action'], additionalProperties: false },
    { type: 'object', properties: {
      spoken: spokenProperty, summary: summaryProperty, action: { type: 'string', enum: ['highlight','press','tilt','squeeze'] },
      controlId: { type: 'string', enum: controls.map(c => c.id) },
      exercise: { type: 'string', enum: ['find','click','practise'] },
    }, required: ['spoken','action','controlId'], additionalProperties: false },
  ],
};
export function validateReply(raw: unknown): TutorReply {
  const x = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('Tutor returned an invalid response. Try again.');
  // Older host/fixture replies may omit summary; display derives one from validated steps.
  if (x.summary !== undefined && !text(x.summary,160)) throw Error('Invalid instruction summary.');
  if ('steps' in x || 'found' in x) {
    if (Object.keys(x).some(k => !['spoken','summary','found','actionId','steps','jargon'].includes(k)) || !text(x.spoken,420) || typeof x.found !== 'boolean' || !(x.actionId === null || text(x.actionId,100)) || !Array.isArray(x.steps) || x.steps.length > 6) throw Error('Invalid knowledge answer.');
    if (!x.found && (x.steps.length || x.actionId !== null || x.jargon !== null)) throw Error('Unknown answers cannot demonstrate actions.');
    x.steps.forEach(validateStep);
    if (x.jargon !== null && (!x.jargon || typeof x.jargon !== 'object' || Array.isArray(x.jargon) || Object.keys(x.jargon).some(k => !['term','means'].includes(k)) || !text(x.jargon.term,120) || !text(x.jargon.means,420))) throw Error('Invalid jargon definition.');
    return x as KnowledgeReply;
  }
  if (Object.keys(x).some(k => !['spoken','summary','action','controlId','exercise'].includes(k)) || typeof x.spoken !== 'string' || !x.spoken.trim() || x.spoken.length > 420 || !actions.includes(x.action)) throw Error('Tutor returned an invalid response. Try again.');
  if (x.controlId !== undefined && (typeof x.controlId !== 'string' || !byId.has(x.controlId))) throw Error('Tutor requested an unknown control.');
  if (x.action !== 'none' && !x.controlId) throw Error('Tutor action needs a control.');
  if (x.exercise !== undefined && !['find','click','practise'].includes(x.exercise)) throw Error('Unsupported exercise.');
  if (x.exercise && !x.controlId) throw Error('Exercise needs a control.');
  const c = byId.get(x.controlId);
  if ((x.action === 'tilt' && c?.motion !== 'stick') || (x.action === 'squeeze' && c?.motion !== 'trigger')) throw Error('Unsupported movement for this control.');
  return x as TutorReply;
}
