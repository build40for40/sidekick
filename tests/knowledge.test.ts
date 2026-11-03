import { describe, expect, it, vi } from 'vitest';
import overcooked from '../knowledge/games/overcooked2/controls.json';
import overcookedGlossary from '../knowledge/games/overcooked2/glossary.json';
import fortnite from '../knowledge/games/fortnite/controls.json';
import fortniteGlossary from '../knowledge/games/fortnite/glossary.json';
import overcookedGold from '../knowledge/games/overcooked2/expected-answers.json';
import fortniteGold from '../knowledge/games/fortnite/expected-answers.json';
import prompt from '../knowledge/system-prompt.md?raw';
import { buildPrompt, detectGame, filterGame, KnowledgeTutor, loadKnowledge, validateKnowledgeReply, type KnowledgePack } from '../src/tutor/knowledge';
import { validateReply, type KnowledgeReply } from '../src/tutor/schema';
import { controls } from '../src/controller/manifest';
import controller from '../knowledge/controllers/ps5.json';
import activeGame from '../knowledge/active-game.json';
const cooking = filterGame(overcooked,overcookedGlossary);
const shooting = filterGame(fortnite,fortniteGlossary);
const pack: KnowledgePack = { prompt, activeGame: 'overcooked2', games: [cooking,shooting] };
const unknown = (): KnowledgeReply => ({ spoken: 'Which game are you playing?', found: false, actionId: null, steps: [], jargon: null });
const l3 = (): KnowledgeReply => ({ spoken: 'L3 clicks the left stick.', found: true, actionId: null, steps: [{ action: 'press', controlId: 'left-stick', say: 'Press the left stick straight down.' }], jargon: null });

describe('pack loading and prompt context', () => {
  it('uses the 19 master IDs and keeps unavailable gamepad indices unmapped', () => {
    expect(controls.map(c => c.id)).toEqual(controller.buttons.map(c => c.id));
    expect(controls).toHaveLength(19);
    expect(controls.find(c => c.id === 'touchpad')?.gamepadButton).toBeUndefined();
    expect(controls.find(c => c.id === 'left-stick')?.description).not.toContain('move your character');
  });
  it('filters unverified rows, their prerequisites and their metadata before prompting', () => {
    const raw = structuredClone(overcooked);
    raw.actions.find(a => a.id === 'put_down')!.verified = false;
    (raw.actions.find(a => a.id === 'wash') as any).verified = ['web'];
    const game = filterGame(raw,overcookedGlossary);
    expect(game.actions.map(a => a.id)).not.toContain('chop');
    const system = buildPrompt(pack,game);
    expect(system).not.toContain('Not sourced');
    expect(system).not.toContain('to_check_on_ps5');
    expect(system).not.toContain('"id":"wash"');
    expect(system).not.toContain('"verified":false');
  });
  it('includes no game facts before an explicit selection', () => {
    const system = buildPrompt(pack);
    expect(system).toContain('NONE SELECTED');
    expect(system).not.toContain('"id":"chop"');
    expect(system).not.toContain('"id":"jump"');
    expect(detectGame(pack,'How do I pick up ingredients?')).toBeUndefined();
    expect(detectGame(pack,'In Overcooked, how do I pick up a tomato?')?.id).toBe('overcooked2');
    expect(detectGame(pack,'Overcooked or Fortnite?')).toBeUndefined();
    expect(detectGame(pack,"I'm not playing Fortnite")).toBeUndefined();
    expect(detectGame(pack,'What is Fortnite?')).toBeUndefined();
    expect(detectGame(pack,'Overcooked')).toBe(cooking);
  });
  it('rejects missing runtime resources', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal('fetch',fetcher);
    try { await expect(loadKnowledge()).rejects.toThrow('Could not load knowledge'); }
    finally { vi.unstubAllGlobals(); }
  });
  it('fetches the configured assets at runtime and passes through the abort signal', async () => {
    const resources: Record<string,unknown> = {
      'active-game.json':activeGame,'system-prompt.md':prompt,
      'games/overcooked2/controls.json':overcooked,'games/overcooked2/glossary.json':overcookedGlossary,
      'games/fortnite/controls.json':fortnite,'games/fortnite/glossary.json':fortniteGlossary,
    };
    const abort = new AbortController();
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      expect(options.signal).toBe(abort.signal);
      const name = Object.keys(resources).find(name => url.includes(name));
      if (!name) throw Error(`Unexpected resource: ${url}`);
      return { ok:true,text:async () => name.endsWith('.md') ? String(resources[name]) : JSON.stringify(resources[name]) };
    });
    vi.stubGlobal('fetch',fetcher);
    try { const loaded = await loadKnowledge(abort.signal); expect(loaded).toEqual(pack); expect(fetcher).toHaveBeenCalledTimes(6); }
    finally { vi.unstubAllGlobals(); }
  });
});

describe('multi-step validation and verified grounding', () => {
  it.each([...overcookedGold.answers.map(a => ({ ...a,game:cooking })),...fortniteGold.answers.map(a => ({ ...a,game:shooting }))])('gold contract only: $question', ({ reply,game }) => {
    expect(validateKnowledgeReply(reply,game)).toEqual(reply);
  });
  it('accepts controller answers without a game but rejects game actions there', () => {
    expect(validateKnowledgeReply(l3())).toEqual(l3());
    expect(() => validateKnowledgeReply(overcookedGold.answers[2].reply)).toThrow('unavailable');
  });
  it('rejects every unsafe step before any part can play', () => {
    const reply = structuredClone(overcookedGold.answers[2].reply);
    const malformed: unknown[] = [
      { ...reply, steps: [...reply.steps,...reply.steps,...reply.steps,...reply.steps] },
      { ...reply, found: false },
      { ...reply, steps: [{ ...reply.steps[0], controlId: 'fake' }] },
      { ...reply, steps: [{ ...reply.steps[0], action: 'tilt' }] },
      { ...reply, steps: [{ ...reply.steps[0], action: ['press'] }] },
      { ...reply, steps: [{ ...reply.steps[0], action: 'squeeze' }] },
      { ...reply, steps: [{ ...reply.steps[0], direction: 'left' }] },
      { ...reply, steps: [{ ...reply.steps[0], times: 4 }] },
      { ...reply, steps: [{ ...reply.steps[0], times: 1.5 }] },
      { ...reply, steps: [{ ...reply.steps[0], hold: 'yes' }] },
      { ...reply, steps: [{ ...reply.steps[0], say: '' }] },
      { ...reply, steps: [{ ...reply.steps[0], execute: 'arbitrary' }] },
      { ...reply, jargon: { term: 'made up', means: '' } },
    ];
    for (const value of malformed) expect(() => validateReply(value)).toThrow();
    expect(() => validateKnowledgeReply({ ...reply, steps: reply.steps.slice(1) },cooking)).toThrow('required');
    expect(() => validateKnowledgeReply({ ...reply, steps: [...reply.steps].reverse() },cooking)).toThrow('required');
    expect(() => validateKnowledgeReply({ ...reply, actionId: 'wash' },cooking)).toThrow('unavailable');
    expect(() => validateKnowledgeReply({ ...reply, steps: [reply.steps[0],{ ...reply.steps[1],hold:true }] },cooking)).toThrow('verified');
  });
});

describe('conversation context', () => {
  it('does not select the configured default automatically, then retains explicit game and one exchange', async () => {
    const generate = vi.fn().mockResolvedValueOnce(unknown()).mockResolvedValueOnce(overcookedGold.answers[1].reply).mockResolvedValueOnce(overcookedGold.answers[2].reply).mockResolvedValueOnce(l3());
    const tutor = new KnowledgeTutor(pack,generate);
    await tutor.reply('How do I pick up a tomato?'); expect(tutor.gameId).toBeNull();
    await tutor.reply('Overcooked'); expect(tutor.gameId).toBe('overcooked2');
    expect(generate.mock.calls[1][0][1].content).toContain('pick up a tomato');
    await tutor.reply('How do I chop it?');
    expect(generate.mock.calls[2][0]).toHaveLength(4);
    expect(generate.mock.calls[2][0][1].content).toBe('Overcooked');
    tutor.setGame(null); await tutor.reply('Where is L3?');
    expect(generate.mock.calls[3][0]).toHaveLength(2); expect(tutor.gameId).toBeNull();
  });
  it('selects active only on request, switches packs and clears old context', async () => {
    const generate = vi.fn().mockResolvedValueOnce(overcookedGold.answers[0].reply).mockResolvedValueOnce(fortniteGold.answers[0].reply);
    const tutor = new KnowledgeTutor(pack,generate,'active');
    await tutor.reply('How do I move?'); await tutor.reply('In Fortnite, how do I jump?');
    expect(tutor.gameId).toBe('fortnite');
    expect(generate.mock.calls[1][0]).toHaveLength(2);
    expect(generate.mock.calls[1][0][0].content).not.toContain('"id":"chop"');
    expect(() => tutor.setGame('missing')).toThrow('Unknown game');
  });
  it('never retains a cancelled response in later model context', async () => {
    let resolve!: (value: KnowledgeReply) => void;
    const generate = vi.fn().mockImplementationOnce(() => new Promise<KnowledgeReply>(r => { resolve = r; })).mockResolvedValue(l3());
    const tutor = new KnowledgeTutor(pack,generate);
    const pending = tutor.reply('Where is L3?'); tutor.interrupt(); resolve(l3());
    await expect(pending).rejects.toThrow('cancelled');
    await tutor.reply('Where is L3 again?'); expect(generate.mock.calls[1][0]).toHaveLength(2);
  });
});
