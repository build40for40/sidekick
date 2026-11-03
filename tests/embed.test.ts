// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  highlight: vi.fn(), animate: vi.fn(), view: vi.fn(), act: vi.fn(), showHints: vi.fn(), dispose: vi.fn(), loadAsset: vi.fn(),
  capabilities: vi.fn(), loadLocal: vi.fn(), runtimeDispose: vi.fn(),
}));
vi.mock('../src/controller/scene', () => ({ ControllerScene: class {
  highlight = mock.highlight; animate = mock.animate; view = mock.view; act = mock.act;
  showHints = mock.showHints; dispose = mock.dispose; loadAsset = mock.loadAsset;
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
    const controls = api.getControls(); controls[0].id = 'invalid'; expect(api.getControls()[0].id).toBe('a');
  });
  it('validates public actions and preserves virtual completion semantics', () => {
    const { api } = mount(); const events: any[] = []; const off = api.on(event => events.push(event));
    expect(() => api.highlight('invalid')).toThrow('Unknown control');
    expect(() => api.action({ spoken: 'bad', action: 'tilt', controlId: 'a' })).toThrow();
    expect(() => api.setView('invalid' as any)).toThrow();
    expect(() => api.startExercise('click', 'a')).toThrow();
    api.startExercise('find', 'a'); api.setHints(false); expect(api.getState().lesson?.hints).toBe(false);
    api.selectControl('a'); expect(api.getState().lesson).toMatchObject({ complete: true, source: 'virtual' });
    expect(events.some(event => event.type === 'selection' && event.source === 'virtual')).toBe(true);
    off(); const count = events.length; api.selectControl('b'); expect(events).toHaveLength(count);
  });
  it('requires first-use consent and handles setup errors without losing exploration', async () => {
    const { api, root } = mount(); const button = root.querySelector<HTMLButtonElement>('.record')!;
    await expect(api.initializeVoice({ consent: false } as any)).rejects.toThrow('consent');
    button.click(); expect(mock.loadLocal).not.toHaveBeenCalled(); expect(root.querySelector('.notice')?.textContent).toContain('Downloads may be large');
    mock.capabilities.mockResolvedValue('WebGPU unavailable'); button.click(); await flush();
    expect(api.getState().error).toBe('WebGPU unavailable'); expect(button.disabled).toBe(false);
    api.highlight('right-bumper'); expect(mock.highlight).toHaveBeenCalledWith('right-bumper');
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
