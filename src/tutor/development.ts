import { controls } from '../controller/manifest';
import type { TutorReply } from './schema';
export function developmentReply(text: string): TutorReply {
  const q = text.toLowerCase().replace(/[?.!]/g, '');
  const c = [...controls].sort((a,b) => Math.max(...b.aliases.map(x=>x.length)) - Math.max(...a.aliases.map(x=>x.length))).find(c => [c.id, ...c.aliases].some(a => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q)));
  if (!c) return { spoken: 'Which control would you like to explore? Try asking where the right bumper is.', action: 'none' };
  if (/practi[sc]e|quiz|find it/.test(q)) return { spoken: `Find ${c.label} on the controller. Select it when you are ready.`, action: 'highlight', controlId: c.id, exercise: 'practise' };
  return { spoken: c.description, action: c.motion === 'trigger' ? 'squeeze' : /click|press/.test(q) ? 'press' : /tilt|move/.test(q) && c.motion === 'stick' ? 'tilt' : 'highlight', controlId: c.id };
}
