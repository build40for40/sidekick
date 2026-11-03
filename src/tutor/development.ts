import { controls, sequences } from '../controller/manifest';
import type { TutorReply } from './schema';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (q: string, words: string[]) => words.some(a => new RegExp(`\\b${escape(a)}\\b`).test(q));
const longest = (words: string[]) => Math.max(...words.map(x => x.length));
export function developmentReply(text: string): TutorReply {
  const q = text.toLowerCase().replace(/[?.!]/g, '');
  // "How do I…" questions about a game move take priority over naming a single control.
  const move = /\bhow\b|\bshow me\b|\bwhat do i press\b|\bcan i\b/.test(q) || !controls.some(c => mentions(q, [c.id, ...c.aliases]))
    ? [...sequences].sort((a,b) => longest(b.aliases) - longest(a.aliases)).find(s => mentions(q, s.aliases)) : undefined;
  if (move) return { spoken: `${move.summary} Watch the controller.`, action: 'sequence', sequenceId: move.id };
  const c = [...controls].sort((a,b) => longest(b.aliases) - longest(a.aliases)).find(c => mentions(q, [c.id, ...c.aliases]));
  if (!c) return { spoken: 'Which control or move would you like to see? Try “How do I build a wall?” or “Where is R2?”', action: 'none' };
  if (/practi[sc]e|quiz|find it/.test(q)) return { spoken: `Find ${c.label} on the controller. Select it when you are ready.`, action: 'highlight', controlId: c.id, exercise: 'practise' };
  return { spoken: c.description, action: c.motion === 'trigger' ? 'squeeze' : /click|press/.test(q) ? 'press' : /tilt|move/.test(q) && c.motion === 'stick' ? 'tilt' : 'highlight', controlId: c.id };
}
