// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  highlight: vi.fn(), animate: vi.fn(), view: vi.fn(), act: vi.fn(), demonstrate: vi.fn(), clearDemonstration: vi.fn(), showHints: vi.fn(), dispose: vi.fn(), loadAsset: vi.fn(() => Promise.resolve()),
  showPlaceholder: vi.fn(), clear: vi.fn(),
  capabilities: vi.fn(), loadLocal: vi.fn(), runtimeDispose: vi.fn(),
  prefetchWhisper: vi.fn(), whisperDispose: vi.fn(),
  setPhysicalInput: vi.fn(),
}));
vi.mock('../src/controller/scene', () => ({ ControllerScene: class {
  highlight = mock.highlight; animate = mock.animate; view = mock.view; act = mock.act;
  showHints = mock.showHints; dispose = mock.dispose; loadAsset = mock.loadAsset;
  demonstrate = mock.demonstrate; clearDemonstration = mock.clearDemonstration; showPlaceholder = mock.showPlaceholder;
  setPhysicalInput = mock.setPhysicalInput;
  clear = mock.clear;
} }));
vi.mock('../src/voice/local', () => ({ capabilities: mock.capabilities, loadLocal: mock.loadLocal, prefetchWhisper: mock.prefetchWhisper }));
import { createSidekick, type Sidekick, type SidekickOptions } from '../src/index';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let instances: Sidekick[] = [];
function mount(options: SidekickOptions = {}) {
  const element = document.createElement('div'); document.body.append(element);
  const api = createSidekick(element, { prefetchWhisper: false, ...options }); instances.push(api);
  return { api, root: element.shadowRoot! };
}
beforeEach(() => { vi.clearAllMocks(); mock.loadLocal.mockReset(); mock.prefetchWhisper.mockReset(); mock.capabilities.mockResolvedValue(null); mock.prefetchWhisper.mockReturnValue({ ready:Promise.resolve(),transcribe:vi.fn(),dispose:mock.whisperDispose }); });
afterEach(() => { instances.forEach(api => api.destroy()); instances = []; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('embedding boundary', () => {
  it('preloads only Whisper by default, shows progress, and keeps the consent step for large models', async () => {
    let ready!: () => void;
    mock.prefetchWhisper.mockImplementation(progress => {
      progress({ stage:'Whisper model',progress:30 });
      return { ready:new Promise<void>(resolve => { ready = resolve; }),dispose:mock.whisperDispose };
    });
    const { api,root } = mount({ prefetchWhisper:undefined });
    await flush();
    expect(mock.prefetchWhisper).toHaveBeenCalledOnce(); expect(mock.loadLocal).not.toHaveBeenCalled();
    expect(root.querySelector('.notice')?.textContent).toContain('30%');
    expect(root.querySelector<HTMLButtonElement>('.record')!.disabled).toBe(false);
    api.highlight('r2'); expect(api.getState().demonstrating).toBe(true);
    ready(); await flush(); expect(api.getState().phase).toBe('ready');
    root.querySelector<HTMLButtonElement>('.record')!.click();
    expect(root.querySelector('.notice')?.textContent).toContain('Downloads may be large');
    expect(mock.loadLocal).not.toHaveBeenCalled();
    mount({ autoInitializeVoice:'true' as any }); await flush();
    expect(mock.loadLocal).not.toHaveBeenCalled(); // Only boolean true authorizes the large download.
  });
  it('auto-initializes opted-in hosts, reuses Whisper, and records with one click after loading', async () => {
    const microphone = vi.fn(() => new Promise<MediaStream>(() => {}));
    vi.stubGlobal('navigator',{ mediaDevices:{ getUserMedia:microphone } });
    const audio = vi.fn(function() { return { resume:()=>Promise.resolve(),close:()=>Promise.resolve() }; });
    vi.stubGlobal('AudioContext',audio);
    mock.loadLocal.mockResolvedValue({ adapters:{ tutor:{ interrupt:vi.fn() } },dispose:mock.runtimeDispose,getGame:()=>null });
    const { api,root } = mount({ autoInitializeVoice:true,performance:{ audioBackend:'wasm' } });
    expect(root.querySelector<HTMLButtonElement>('.record')!.disabled).toBe(true);
    await flush();
    expect(mock.loadLocal).toHaveBeenCalledOnce(); expect(mock.prefetchWhisper).toHaveBeenCalledOnce();
    expect(mock.loadLocal.mock.calls[0][4]).toBe(mock.prefetchWhisper.mock.results[0].value);
    expect(mock.prefetchWhisper.mock.calls[0][2]).toBe('wasm');
    expect(mock.loadLocal.mock.calls[0][3]).toMatchObject({ audioBackend:'wasm',tutor:'quality' });
    expect(api.getState()).toMatchObject({ mode:'local',phase:'ready' });
    expect(microphone).not.toHaveBeenCalled(); expect(audio).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.record')!.click(); await flush();
    expect(microphone).toHaveBeenCalledOnce(); expect(api.getState().phase).toBe('listening');
    expect(root.querySelector('.notice')?.textContent).not.toContain('Download local voice');
  });
  it('silently skips background prefetch on unsupported browsers and keeps auto-start errors recoverable', async () => {
    mock.capabilities.mockResolvedValue('WebGPU unavailable');
    const normal = mount({ prefetchWhisper:undefined }); await flush();
    expect(normal.api.getState().error).toBeNull(); expect(mock.prefetchWhisper).not.toHaveBeenCalled();
    const automatic = mount({ autoInitializeVoice:true }); await flush();
    expect(mock.loadLocal).not.toHaveBeenCalled();
    expect(automatic.api.getState()).toMatchObject({ mode:'development',error:'WebGPU unavailable' });
    automatic.api.selectControl('cross'); expect(automatic.api.getState().selectedControl).toBe('cross');
  });
  it('aborts auto-start and recognition prefetch when destroyed during loading', async () => {
    let signal: AbortSignal | undefined;
    mock.loadLocal.mockImplementation((_progress,s) => { signal = s; return new Promise((_resolve,reject) => s.addEventListener('abort',()=>reject(Error('cancelled')))); });
    const { api } = mount({ autoInitializeVoice:true }); await flush();
    api.destroy(); await flush();
    expect(signal?.aborted).toBe(true); expect(mock.whisperDispose).toHaveBeenCalled();
    expect(api.getState().destroyed).toBe(true); expect(mock.runtimeDispose).not.toHaveBeenCalled();
  });
  it('recovers from a blocked recognition worker without leaving a perpetual preload notice', async () => {
    mock.prefetchWhisper.mockImplementationOnce(() => { throw Error('Worker blocked by host policy'); });
    const { api,root } = mount({ prefetchWhisper:undefined }); await flush();
    expect(api.getState()).toMatchObject({ phase:'ready',progress:null });
    expect(root.querySelector('.notice')?.textContent).toContain('could not preload');
    expect(root.querySelector<HTMLButtonElement>('.record')!.disabled).toBe(false);
  });
  it('stops active step narration and prevents the next step or visual loop from restarting after X', async () => {
    vi.useFakeTimers();
    const sources: { onended:(() => void) | null; stop: ReturnType<typeof vi.fn> }[]=[];
    vi.stubGlobal('AudioContext',class {
      state='running';baseLatency=0;resume=async()=>{};close=async()=>{};
      createBuffer(){return {copyToChannel(){}};}
      createBufferSource(){const source={onended:null as (()=>void)|null,stop:vi.fn(),connect(){},start(){},buffer:null};sources.push(source);return source;}
    });
    const synthesize=vi.fn(async()=>({pcm:new Float32Array(10),sampleRate:24000}));
    mock.loadLocal.mockResolvedValue({ adapters:{
      tutor:{reply:async()=>({spoken:'Start here.',found:true,actionId:null,jargon:null,steps:[{action:'press',controlId:'left-stick',say:'Press the stick.'},{action:'press',controlId:'cross',say:'Press Cross.'}]}),interrupt:vi.fn()},
      synthesis:{synthesize},
    },dispose:mock.runtimeDispose,getGame:()=>null });
    const { api,root }=mount({ gamepad:false });await api.initializeVoice({consent:true});
    const events:any[]=[];api.on(event=>events.push(event));api.ask('Show me.');await flush();
    sources[0].onended!();await flush();
    expect(api.getState().demonstrating).toBe(true);const prepared=synthesize.mock.calls.length;
    root.querySelector<HTMLButtonElement>('.exit-animation')!.click();await flush();vi.advanceTimersByTime(10000);
    expect(sources[1].stop).toHaveBeenCalledOnce();expect(synthesize).toHaveBeenCalledTimes(prepared);expect(sources).toHaveLength(2);
    expect(api.getState()).toMatchObject({phase:'ready',demonstrating:false});
    expect(events.some(event=>event.type==='demonstration')).toBe(false);expect(vi.getTimerCount()).toBe(0);
  });
  it('stops unlimited demonstrations with the X button and Escape, returns front and restores focus', () => {
    vi.useFakeTimers();
    const { api,root } = mount({ gamepad:false });
    const exit = root.querySelector<HTMLButtonElement>('.exit-animation')!;
    expect(exit.hidden).toBe(true);
    const play = () => api.action({ spoken:'Press square.',action:'press',controlId:'square' });
    play(); expect(exit.hidden).toBe(false); expect(api.getState().demonstrating).toBe(true);
    exit.focus(); exit.click();
    expect(vi.getTimerCount()).toBe(0); expect(exit.hidden).toBe(true); expect(mock.clear).toHaveBeenCalledOnce();
    expect(root.activeElement).toBe(root.querySelector('.record'));
    play(); const escape = new KeyboardEvent('keydown',{ key:'Escape',bubbles:true,cancelable:true }); document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true); expect(exit.hidden).toBe(true); expect(api.getState().selectedControl).toBeNull();
    const count = mock.demonstrate.mock.calls.length; vi.advanceTimersByTime(20000); expect(mock.demonstrate).toHaveBeenCalledTimes(count);
    const idleEscape = new KeyboardEvent('keydown',{ key:'Escape',cancelable:true }); document.dispatchEvent(idleEscape); expect(idleEscape.defaultPrevented).toBe(false);
  });
  it('hides the X when a finite demonstration completes and scopes Escape to the latest active instance', () => {
    vi.useFakeTimers();
    const first = mount({ gamepad:false }), second = mount({ gamepad:false });
    const reply = { spoken:'Press.',action:'press' as const,controlId:'cross' };
    first.api.action(reply); second.api.action(reply);
    document.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape',cancelable:true }));
    expect(first.api.getState().demonstrating).toBe(true); expect(second.api.getState().demonstrating).toBe(false);
    second.api.destroy();
    first.api.stop(); first.api.setPlayback({ maxRepeats:1 }); first.api.action(reply); vi.advanceTimersByTime(2150);
    expect(first.root.querySelector<HTMLButtonElement>('.exit-animation')!.hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('streams live physical state without canned animation, camera movement or extra UI', () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { index: 0, id: 'Test', mapping: 'standard', connected: true, buttons, axes: [0, 0, 0, 0] };
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    const cancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', cancel);
    const { api, root } = mount(); const events: any[] = []; api.on(event => events.push(event));
    expect(api.getState().gamepad).toMatchObject({ status: 'connected', controller: { id: 'Test' } });
    const count = root.querySelectorAll('*').length;
    api.startExercise('click', 'left-stick');
    mock.animate.mockClear(); mock.highlight.mockClear(); mock.view.mockClear();
    pad.axes = [.7, -.4, 0, 0]; frame!(0);
    expect(api.getState().lesson?.complete).toBe(false);
    expect(mock.setPhysicalInput.mock.lastCall?.[0].find((c: any) => c.controlId === 'left-stick').axes[0]).toBeGreaterThan(0);
    buttons[10] = { pressed: true, touched: true, value: 1 }; frame!(0);
    expect(api.getState().lesson).toMatchObject({ complete: true, source: 'physical' });
    expect(events.filter(event => event.type === 'selection')).toEqual([{ type: 'selection', controlId: 'left-stick', source: 'physical' }]);
    expect(mock.animate).not.toHaveBeenCalled(); expect(mock.highlight).not.toHaveBeenCalled(); expect(mock.view).not.toHaveBeenCalled();
    const snapshot = api.getState(); snapshot.gamepad.controls[0].value = .123;
    expect(api.getState().gamepad.controls[0].value).toBe(0);
    expect(root.querySelectorAll('*')).toHaveLength(count);
    api.enableGamepad(false); expect(api.getState().gamepad.status).toBe('disabled');
    expect(mock.setPhysicalInput).toHaveBeenLastCalledWith([]); expect(cancel).toHaveBeenCalled();
    api.destroy(); expect(api.getState().gamepad.status).toBe('disabled');
  });
  it('allows opting out of polling at mount and enabling it later', () => {
    const poll = vi.fn(() => []); vi.stubGlobal('navigator', { getGamepads: poll });
    const { api } = mount({ gamepad: false });
    expect(api.getState().gamepad.status).toBe('disabled'); expect(poll).not.toHaveBeenCalled();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    api.enableGamepad(true); expect(poll).toHaveBeenCalledOnce(); expect(api.getState().gamepad.status).toBe('waiting');
  });
  it('keeps game and playback settings in the API, validates full sequences and cancels their timers', () => {
    vi.useFakeTimers();
    const { api,root } = mount({ gamepad: false });
    expect(api.getState().game).toBeNull();
    api.setGame('overcooked2'); expect(api.getState().game).toBe('overcooked2');
    expect(() => api.setGame('unknown')).toThrow('Unknown game');
    expect(() => api.setPlayback({ maxRepeats:0 })).toThrow();
    api.setPlayback({ speed:'fast',maxRepeats:2 });
    const steps=[{action:'press' as const,controlId:'cross',say:'Put it down.'},{action:'press' as const,controlId:'square',say:'Chop it.'}];
    api.action({spoken:'Chop.',found:true,actionId:'chop',steps,jargon:null});
    expect(mock.demonstrate).toHaveBeenLastCalledWith(steps[0],1100);
    vi.advanceTimersByTime(1450);expect(mock.demonstrate).toHaveBeenLastCalledWith(steps[1],1100);
    expect(() => api.action({spoken:'Bad.',found:false,actionId:null,steps,jargon:null})).toThrow();
    api.setGame(null);expect(vi.getTimerCount()).toBe(0);expect(api.getState().game).toBeNull();
    expect(root.querySelectorAll('select,input')).toHaveLength(0);
    api.action({spoken:'Show.',action:'highlight',controlId:'left-stick'});expect(vi.getTimerCount()).toBe(1);
    api.destroy();expect(vi.getTimerCount()).toBe(0);
  });
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
    api.highlight('r1'); expect(mock.demonstrate).toHaveBeenCalledWith(expect.objectContaining({ controlId:'r1' }),1100);
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
  it('credits the model and labels pack moves once a game is selected', () => {
    const { api, root } = mount();
    expect(mock.loadAsset).toHaveBeenCalledOnce();
    const credit = root.querySelector<HTMLAnchorElement>('.credit')!;
    expect(credit.textContent).toContain('AHarmlessPotato'); expect(credit.title).toContain('CC Attribution 4.0');
    expect(root.querySelector('.pack-note')?.hasAttribute('hidden')).toBe(true);
    api.setGame('fortnite'); expect(root.querySelector('.pack-note')?.hasAttribute('hidden')).toBe(false);
  });
  it('disposes loaded runtime resources on unmount', async () => {
    mock.loadLocal.mockResolvedValue({ adapters: { tutor: { interrupt: vi.fn() } }, dispose: mock.runtimeDispose, getGame: () => null, setGame: vi.fn() });
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
