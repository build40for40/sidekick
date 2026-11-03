import { controls } from '../controller/manifest';
import { validateReply, validateStep, type KnowledgeReply, type TutorStep } from './schema';

export interface GameAction { id: string; plain: string; mode?: string; needs?: string; ps5: Omit<TutorStep, 'say'>[] }
export interface GamePack {
  id: string; name: string; controller: string; preset: string; default_mode: string;
  coach_notes: string[]; actions: GameAction[];
  terms: { term: string; means: string; actions: string[] }[];
}
export interface KnowledgePack { prompt: string; activeGame: string; games: GamePack[] }
export type GameSelection = string | null;
const approved = (row: { verified?: unknown }) => typeof row.verified === 'string' && ['device','web','approved'].includes(row.verified);
export function filterGame(raw: any, glossary: any): GamePack {
  if (!raw || raw.controller !== 'ps5' || !Array.isArray(raw.actions) || !Array.isArray(glossary?.terms)) throw Error('Unsupported knowledge pack.');
  let actions: GameAction[] = raw.actions.filter(approved).map((row: any) => {
    if (typeof row.id !== 'string' || typeof row.plain !== 'string' || !Array.isArray(row.ps5) || !row.ps5.length) throw Error('Invalid knowledge action.');
    const ps5 = row.ps5.map((step: any) => {
      validateStep({ ...step, say: 'Validate control mapping.' });
      return { action: step.action, controlId: step.controlId, ...(step.hold === undefined ? {} : { hold: step.hold }), ...(step.times === undefined ? {} : { times: step.times }), ...(step.direction === undefined ? {} : { direction: step.direction }) };
    });
    return { id: row.id, plain: row.plain, mode: row.mode, needs: row.needs, ps5 };
  });
  // An approved action must not smuggle in an unapproved prerequisite or a dependency cycle.
  const original = new Map(actions.map(a => [a.id,a]));
  const usable = (action: GameAction, trail = new Set<string>()): boolean => {
    if (trail.has(action.id)) return false;
    if (!action.needs) return true;
    const parent = original.get(action.needs);
    return !!parent && usable(parent,new Set([...trail,action.id]));
  };
  actions = actions.filter(a => usable(a));
  const ids = new Set(actions.map(a => a.id));
  const terms = glossary.terms.filter(approved).map((row: any) => {
    if (typeof row.term !== 'string' || typeof row.means !== 'string' || !Array.isArray(row.actions)) throw Error('Invalid glossary term.');
    return { term: row.term, means: row.means, actions: row.actions.filter((id: string) => ids.has(id)) };
  });
  return { id: raw.id, name: raw.name, controller: raw.controller, preset: raw.preset, default_mode: raw.default_mode, coach_notes: raw.coach_notes, actions, terms };
}
// Vite emits these as sibling assets. Fetch at runtime so pack contents are not baked into prompt code.
const files = import.meta.glob(['../../knowledge/active-game.json','../../knowledge/system-prompt.md','../../knowledge/games/*/controls.json','../../knowledge/games/*/glossary.json'], { query: '?url&no-inline', import: 'default', eager: true }) as Record<string,string>;
export async function loadKnowledge(signal?: AbortSignal): Promise<KnowledgePack> {
  const read = async (path: string) => {
    const url = files[`../../knowledge/${path}`];
    if (!url) throw Error(`Knowledge file unavailable: ${path}`);
    const response = await fetch(url, { signal, cache: 'no-cache' });
    if (!response.ok) throw Error(`Could not load knowledge: ${path}`);
    return response.text();
  };
  const active = JSON.parse(await read('active-game.json'));
  if (active.controller !== 'ps5' || !Array.isArray(active.available_games) || !active.available_games.includes(active.game)) throw Error('Invalid active game configuration.');
  const games: GamePack[] = [];
  for (const id of active.available_games) {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw Error('Invalid game identifier.');
    const game = filterGame(JSON.parse(await read(`games/${id}/controls.json`)), JSON.parse(await read(`games/${id}/glossary.json`)));
    if (game.id !== id) throw Error('Game identifier mismatch.');
    games.push(game);
  }
  return { prompt: await read('system-prompt.md'), activeGame: active.game, games };
}
export function resolveGame(pack: KnowledgePack, selection: GameSelection): GamePack | undefined {
  if (selection === null) return undefined;
  const id = selection === 'active' ? pack.activeGame : selection;
  const game = pack.games.find(g => g.id === id);
  if (!game) throw Error(`Unknown game: ${selection}`);
  return game;
}
export function detectGame(pack: KnowledgePack, question: string): GamePack | undefined {
  const normalized = ` ${question.toLowerCase().replace(/[^a-z0-9]+/g,' ')} `;
  const matches = pack.games.filter(game => {
    const names = [game.id, game.name, game.id.replace(/\d+$/, '')];
    return names.some(name => normalized.includes(` ${name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()} `));
  });
  if (matches.length !== 1) return undefined;
  const game = matches[0];
  const names = [game.id,game.name,game.id.replace(/\d+$/, '')].map(name => name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim());
  return names.some(name => {
    if (normalized.trim() === name) return true; // Answer to "Which game?"
    const index = normalized.indexOf(` ${name} `);
    if (index < 0) return false;
    const before = normalized.slice(0,index+1);
    const after = normalized.slice(index+name.length+2).trim();
    const explicit = /\b(?:in|playing|play|game is)\s+$/.test(before);
    const negative = /\b(?:not|no longer|stopped|quit|don t|isn t|aren t)\s+(?:playing|play|in)\s+$/.test(before);
    return (explicit && !negative) || (!before.trim() && /^(?:how|where|what|can|why)\b/.test(after));
  }) ? game : undefined;
}
export function buildPrompt(pack: KnowledgePack, game?: GamePack): string {
  return `${pack.prompt}\nCONTROLLER: ${JSON.stringify(controls.map(({ id,label,aliases,description,motion }) => ({ id,name: label,aka: aliases,description,motion })))}\nGAME: ${game ? JSON.stringify({ id: game.id, name: game.name, preset: game.preset, default_mode: game.default_mode, coach_notes: game.coach_notes, actions: game.actions }) : 'NONE SELECTED. Answer controller questions only. For a gameplay question ask which game they are playing. Never infer the game from food, ingredients, or other gameplay words.'}\nGLOSSARY: ${JSON.stringify(game?.terms ?? [])}`;
}
const sameInput = (a: Omit<TutorStep,'say'>, b: Omit<TutorStep,'say'>) => a.action === b.action && a.controlId === b.controlId && (a.hold ?? false) === (b.hold ?? false) && (a.times ?? 1) === (b.times ?? 1) && a.direction === b.direction;
export function validateKnowledgeReply(raw: unknown, game?: GamePack): KnowledgeReply {
  const reply = validateReply(raw);
  if (!('steps' in reply)) throw Error('The model must return a knowledge answer.');
  if (reply.actionId !== null) {
    const action = game?.actions.find(a => a.id === reply.actionId);
    if (!game || !action || !reply.found) throw Error('Tutor requested an unavailable game action.');
    const required: Omit<TutorStep,'say'>[] = [];
    const add = (a: GameAction) => { if (a.needs) add(game.actions.find(p => p.id === a.needs)!); required.push(...a.ps5); };
    add(action);
    const allowed = game.actions.flatMap(a => a.ps5);
    if (reply.steps.some(step => !allowed.some(input => sameInput(input,step)))) throw Error('Tutor changed a verified input.');
    let cursor = 0;
    for (const step of reply.steps) if (required[cursor] && sameInput(required[cursor],step)) cursor++;
    if (cursor !== required.length) throw Error('Tutor omitted a required step.');
  }
  if (reply.jargon && !game?.terms.some(term => term.term.toLowerCase() === reply.jargon!.term.toLowerCase())) throw Error('Tutor used an unavailable glossary term.');
  return reply;
}

export interface TutorMessage { role: 'system' | 'user' | 'assistant'; content: string }
export class KnowledgeTutor {
  private game?: GamePack;
  private history: TutorMessage[] = [];
  private revision = 0;
  constructor(private pack: KnowledgePack, private generate: (messages: TutorMessage[]) => Promise<unknown>, selection: GameSelection = null) { this.setGame(selection); }
  get gameId(): string | null { return this.game?.id ?? null; }
  setGame(selection: GameSelection) { const game = resolveGame(this.pack,selection); this.game = game; this.history = []; this.revision++; }
  interrupt() { this.revision++; }
  async reply(text: string): Promise<KnowledgeReply> {
    const named = detectGame(this.pack,text);
    if (named && named.id !== this.game?.id) {
      // Keep the pending controller-only exchange when answering "Which game?".
      // Switching away from an established game must discard its action context.
      const pending = this.game ? [] : this.history;
      this.setGame(named.id); this.history = pending;
    }
    const revision = this.revision;
    const reply = validateKnowledgeReply(await this.generate([{ role: 'system', content: buildPrompt(this.pack,this.game) }, ...this.history, { role: 'user', content: text.slice(0,1200) }]),this.game);
    if (revision !== this.revision) throw Error('Tutor turn was cancelled.');
    // Keep only the latest exchange. No microphone data or conversation is persisted.
    this.history = [{ role: 'user', content: text.slice(0,1200) }, { role: 'assistant', content: JSON.stringify(reply) }];
    return reply;
  }
}
