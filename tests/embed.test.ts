// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  highlight: vi.fn(), animate: vi.fn(), view: vi.fn(), act: vi.fn(), showHints: vi.fn(), dispose: vi.fn(), loadAsset: vi.fn(() => Promise.resolve()),
  showPlaceholder: vi.fn(), stopSequence: vi.fn(), playSequence: vi.fn(),
  capabilities: vi.fn(), loadLocal: vi.fn(), runtimeDispose: vi.fn(),
}));
vi.mock('../src/controller/scene', () => ({ ControllerScene: class {
  highlight = mock.highlight; animate = mock.animate; view = mock.view; act = mock.act;
  showHints = mock.showHints; dispose = mock.dispose; loadAsset = mock.loadAsset;
  showPlaceholder = mock.showPlaceholder; stopSequence = mock.stopSequence; playSequence = mock.playSequence;
} }));
vi.mock('../src/voice/local', () => ({ capabilities: mock.capabilities, loadLocal: mock.loadLocal }));
import { createSidekick, type Sidekick } from '../src/index';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let instances: Sidekick[] = [];
function mount() {
  const element = document.createElement('div'); document.body.append(element);
  const api = createSidekick(element); instances.push(api);
  return { api, root: element.shadowRoot! };
}
beforeEach(() => { vi.clearAllMocks(); mock.capabilities.mockResolvedValue(null); });
afterEach(() => { instances.forEach(api => api.destroy()); instances = []; document.body.replaceChildren(); });
describe('embedding boundary', () => {
  it('mounts isolated styles and only one visible main control', () => {
    const { api, root } = mount();
    expect(root.querySelectorAll('.record')).toHaveLength(1);
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelector('.notice')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('style')).not.toBeNull();
    expect(document.querySelector('style')).toBeNull();
    const state = api.getState(); state.mode = 'local'; expect(api.getState().mode).toBe('development');
    const controls = api.getControls(); controls[0].id = 'invalid'; expect(api.getControls()[0].id).toBe('cross');
  });
  it('validates public actions and preserves virtual completion semantics', () => {
    const { api } = mount(); const events: any[] = []; const off = api.on(event => events.push(event));
    expect(() => api.highlight('invalid')).toThrow('Unknown control');
    expect(() => api.action({ spoken: 'bad', action: 'tilt', controlId: 'cross' })).toThrow();
    expect(() => api.setView('invalid' as any)).toThrow();
    expect(() => api.startExercise('click', 'cross')).toThrow();
    api.startExercise('find', 'cross'); api.setHints(false); expect(api.getState().lesson?.hints).toBe(false);
    api.selectControl('cross'); expect(api.getState().lesson).toMatchObject({ complete: true, source: 'virtual' });
    expect(events.some(event => event.type === 'selection' && event.source === 'virtual')).toBe(true);
    off(); const count = events.length; api.selectControl('circle'); expect(events).toHaveLength(count);
  });
  it('requires first-use consent and handles setup errors without losing exploration', async () => {
    const { api, root } = mount(); const button = root.querySelector<HTMLButtonElement>('.record')!;
    await expect(api.initializeVoice({ consent: false } as any)).rejects.toThrow('consent');
    button.click(); expect(mock.loadLocal).not.toHaveBeenCalled(); expect(root.querySelector('.notice')?.textContent).toContain('Downloads may be large');
    mock.capabilities.mockResolvedValue('WebGPU unavailable'); button.click(); await flush();
    expect(api.getState().error).toBe('WebGPU unavailable'); expect(button.disabled).toBe(false);
    api.highlight('r1'); expect(mock.highlight).toHaveBeenCalledWith('r1');
  });
  it('deduplicates setup and aborts pending initialization on unmount', async () => {
    let signal: AbortSignal | undefined;
    mock.loadLocal.mockImplementation((_progress, s) => { signal = s; return new Promise((_resolve, reject) => s.addEventListener('abort', () => reject(Error('aborted')))); });
    const { api, root } = mount(); const first = api.initializeVoice({ consent: true });
    expect(api.initializeVoice({ consent: true })).toBe(first);
    await flush(); expect(mock.loadLocal).toHaveBeenCalledOnce();
    const rejected = expect(first).rejects.toThrow('aborted'); api.destroy(); await rejected;
    expect(signal?.aborted).toBe(true); expect(root.childNodes).toHaveLength(0); expect(mock.dispose).toHaveBeenCalledOnce();
    api.destroy(); expect(mock.dispose).toHaveBeenCalledOnce();
    expect(() => api.ask('hello')).toThrow('destroyed');
  });
  it('plays moves step by step, reports progress and stops on other input', async () => {
    let finish: (done: boolean) => void = () => {};
    mock.playSequence.mockImplementation((_move, onStep) => { onStep(0, _move.steps[0]); return new Promise(resolve => { finish = resolve; }); });
    const { api, root } = mount(); const events: any[] = []; api.on(event => events.push(event));
    const moves = api.getMoves(); expect(moves[0]).toMatchObject({ id: 'jump', featured: true });
    moves[0].title = 'changed'; expect(api.getMoves()[0].title).not.toBe('changed');
    expect(() => api.playMove('moonwalk')).toThrow('Unknown move');
    const wall = moves.find(m => m.id === 'wall_back')!;
    const played = api.playMove('wall_back');
    expect(api.getState().move).toEqual({ id: 'wall_back', step: 0, complete: false });
    expect(root.querySelector('.notice')?.textContent).toContain(`1 of ${wall.steps.length}`);
    expect(root.querySelector('.move-note')?.hasAttribute('hidden')).toBe(false);
    finish(true); await expect(played).resolves.toBe(true);
    expect(api.getState().move?.complete).toBe(true);
    api.selectControl('cross'); expect(mock.stopSequence).toHaveBeenCalled(); expect(api.getState().move).toBeNull();
    expect(events.filter(e => e.type === 'move').at(-1)).toEqual({ type: 'move', move: null });
  });
  it('plays a validated sequence action and rejects unknown moves', () => {
    mock.playSequence.mockResolvedValue(true);
    const { api } = mount();
    expect(() => api.action({ spoken: 'x', action: 'sequence', sequenceId: 'moonwalk' })).toThrow('unknown move');
    api.action({ spoken: 'Build a wall.', action: 'sequence', sequenceId: 'wall_back' });
    expect(mock.playSequence).toHaveBeenCalledOnce(); expect(api.getState().move?.id).toBe('wall_back');
  });
  it('disposes loaded runtime resources on unmount', async () => {
    mock.loadLocal.mockResolvedValue({ adapters: { tutor: { interrupt: vi.fn() } }, dispose: mock.runtimeDispose });
    const { api } = mount(); await api.initializeVoice({ consent: true }); expect(api.getState().mode).toBe('local');
    api.destroy(); expect(mock.runtimeDispose).toHaveBeenCalledOnce();
  });
});

it('allows remount after destruction but rejects a second live instance', () => {
  const element = document.createElement('div'); document.body.append(element);
  const first = createSidekick(element); instances.push(first);
  expect(() => createSidekick(element)).toThrow('unused mount');
  first.destroy(); const second = createSidekick(element); instances.push(second);
  expect(second.getState().destroyed).toBe(false);
});
