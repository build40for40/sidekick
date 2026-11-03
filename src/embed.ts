import { instructionSummary } from './tutor/summary';
import { createSettings } from './settings';
import { localModelLabels, modelKey, validateModelSelection, type TutorModelSelection } from './tutor/models';
import { inferenceOptions, sameOriginEndpoint, type InferenceOptions, type RemoteInferenceOptions } from './voice/remote';
import styles from './style.css?inline';
import { ControllerScene } from './controller/scene';
import { byId, controls, manifest, type View } from './controller/manifest';
import { PhysicalInput, inputActive, type GamepadState } from './controller/gamepad';
import { transitionLesson, type Lesson, type LessonKind, type InputSource } from './tutor/lesson';
import { validateReply, replySteps, type TutorReply } from './tutor/schema';
import { DemonstrationPlayer, playbackOptions, type PlaybackOptions } from './tutor/playback';
import type { GameSelection } from './tutor/knowledge';
import activeGame from '../knowledge/active-game.json';
import { VoiceOrchestrator } from './voice/orchestrator';
import { capabilities, loadLocal, loadRemote, prefetchWhisper, type LocalRuntime, type WhisperRuntime } from './voice/local';
import type { Phase, Progress, VoiceEvent } from './voice/types';
import { tutorModels, performanceOptions, type VoicePerformanceOptions } from './voice/config';

export interface SidekickOptions {
  /** Explicit remote generation opt-in. Recognition and synthesis remain on device. */
  inference?: InferenceOptions;
  /** Remote models offered in Settings. Keys and credentials remain on the server. */
  remoteModels?: RemoteInferenceOptions[];
  /** Optional same-origin catalog endpoint. Loaded when Settings first opens. */
  modelCatalog?: string;
  /** Show spoken replies below the controller. The host can render captions from reply events instead. */
  captions?: boolean;
  /** No game is selected by default. 'active' explicitly selects the pack configuration. */
  game?: GameSelection;
  playback?: PlaybackOptions;
  /** Select a local model/backend for latency versus quality comparisons. */
  performance?: VoicePerformanceOptions;
  /** Live controller feedback is enabled by default. No connection UI is added. */
  gamepad?: boolean;
  /** Preload recognition on capable browsers. Defaults to true; large models still require consent. */
  prefetchWhisper?: boolean;
  /** Host confirms setup consent for downloads and configured remote text transmission. Defaults to false. */
  autoInitializeVoice?: boolean;
}
export interface SidekickState {
  phase: Phase;
  mode: 'development' | 'local' | 'remote';
  model: TutorModelSelection;
  selectedControl: string | null;
  lesson: Lesson | null;
  caption: string;
  /** Brief display instructions, independent of the spoken caption. */
  summary: string;
  error: string | null;
  progress: Progress | null;
  game: string | null;
  jargon: { term: string; means: string } | null;
  destroyed: boolean;
  gamepad: GamepadState;
  demonstrating: boolean;
}
export type SidekickEvent = VoiceEvent
  | { type: 'progress'; progress: Progress }
  | { type: 'mode'; mode: SidekickState['mode'] }
  | { type: 'settings'; model: TutorModelSelection; game: string | null }
  | { type: 'selection'; controlId: string; source: InputSource }
  | { type: 'lesson'; lesson: Lesson | null }
  | { type: 'view'; view: View }
  | { type: 'gamepad'; message: string }
  | { type: 'gamepad-input'; state: GamepadState }
  | { type: 'destroyed' };
export interface Sidekick {
  getState(): SidekickState;
  getControls(): typeof controls;
  on(listener: (event: SidekickEvent) => void): () => void;
  /** Call after disclosing model downloads and, in remote mode, transcript/context transmission. */
  initializeVoice(options: { consent: true }): Promise<void>;
  /** Call recording/playback methods from a user gesture for browser audio permission. */
  startRecording(): Promise<void>;
  finishRecording(): void;
  ask(text: string): void;
  stop(): void;
  repeat(): void;
  highlight(controlId: string | null): void;
  selectControl(controlId: string): void;
  action(reply: TutorReply): void;
  setView(view: View): void;
  startExercise(kind: LessonKind, controlId: string): void;
  setHints(enabled: boolean): void;
  setCaptions(enabled: boolean): void;
  setGame(game: GameSelection): void;
  /** Cancel current work and select a model. Record/setup requires fresh consent. */
  setModel(model: TutorModelSelection): void;
  setPlayback(options: PlaybackOptions): void;
  enableGamepad(enabled: boolean): void;
  destroy(): void;
}

const ownedRoots = new WeakMap<HTMLElement, ShadowRoot>();
const activeMounts = new WeakSet<HTMLElement>();
// Escape closes only the most recently active instance, without consuming it when nothing is playing.
const activeDemonstrations = new Set<HTMLElement>();

/** Mount one isolated component. The host owns its dimensions and surrounding UI. */
export function createSidekick(container: HTMLElement, options: SidekickOptions = {}): Sidekick {
  let inference = inferenceOptions(options.inference);
  let remote = inference.mode === 'remote';
  playbackOptions(options.playback);
  let performance = performanceOptions(options.performance);
  const initialModel: TutorModelSelection = inference.mode === 'remote' ? inference : { mode: 'local', model: performance.tutor };
  const remoteModels = (options.remoteModels ?? []).map(validateModelSelection);
  if (inference.mode === 'remote') remoteModels.push(inference);
  const catalogEndpoint = options.modelCatalog === undefined ? undefined : sameOriginEndpoint(options.modelCatalog);
  const checkGame = (game: GameSelection) => { if (game !== null && game !== 'active' && !activeGame.available_games.includes(game)) throw Error(`Unknown game: ${game}`); };
  let game: GameSelection = options.game ?? null;
  checkGame(game);
  if (activeMounts.has(container) || (container.shadowRoot && !ownedRoots.has(container))) throw Error('Sidekick needs an unused mount element.');
  const root = ownedRoots.get(container) ?? container.attachShadow({ mode: 'open' });
  ownedRoots.set(container, root); activeMounts.add(container);
  root.innerHTML = `<style>${styles}</style><section class="sidekick" aria-label="Controller tutor">
    <p class="asset-note"><a class="credit" target="_blank" rel="noopener"></a><span class="demo-note"> · text demo</span></p>
    <div class="scene"></div>
    <button class="exit-animation" type="button" aria-label="Stop animation" aria-keyshortcuts="Escape" title="Stop animation (Esc)" hidden><span aria-hidden="true">×</span></button>
    <div class="record-area"><p class="notice" role="status" aria-live="polite" hidden></p>
    <p class="caption" aria-live="polite" hidden></p>
    <p class="instruction-summary" aria-live="polite" hidden></p>
    <div class="record-controls"><button class="record" type="button" aria-label="Set up local voice" aria-pressed="false">
      <svg class="mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M8 21h8"/></svg>
      <span class="record-label">Record</span>
    </button>
    <button class="settings-toggle" type="button" aria-label="Tutor settings" title="Settings" aria-expanded="false" aria-controls="settings-panel" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 3-.5 2a7 7 0 0 0-1.6.9L5 5.4 3 8.8l1.5 1.4a8 8 0 0 0 0 1.8L3 13.4 5 17l1.9-.5a7 7 0 0 0 1.6.9L9 20h4l.5-2.6a7 7 0 0 0 1.6-.9l1.9.5 2-3.6-1.5-1.4a8 8 0 0 0 0-1.8L19 8.8l-2-3.4-1.9.5a7 7 0 0 0-1.6-.9L13 3Z"/><circle cx="11" cy="11.5" r="3"/></svg>
    </button></div></div>
    <section class="settings-panel" id="settings-panel" role="dialog" aria-label="Tutor settings" hidden>
      <div class="settings-heading"><h2>Settings</h2><button class="settings-close" type="button" aria-label="Close settings">×</button></div>
      <label>Tutor model<select class="model-select"></select></label>
      <p class="settings-status"></p><p class="catalog-status" role="status"></p>
      <label>Game<select class="game-select"></select></label>
      <p class="settings-hint">After changing models, press Record to finish setup.</p>
    </section>
    <div class="control-access" role="group" aria-label="Controller controls"></div>
  </section>`;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const button = find<HTMLButtonElement>('.record');
  const exit = find<HTMLButtonElement>('.exit-animation');
  const notice = find('.notice');
  const caption = find('.caption');
  const summary = find('.instruction-summary');
  const label = find('.record-label');
  const events = new EventTarget();
  const subscriptions = new Set<EventListener>();
  const abort = new AbortController();
  let setupAbort = new AbortController();
  let setupRevision = 0;
  let settings: ReturnType<typeof createSettings> | undefined;
  let catalogStatus = '';
  let catalogLoaded = false;
  let catalogLoading = false;
  let state: SidekickState = { phase: 'ready', mode: 'development', model: initialModel, selectedControl: null, lesson: null, caption: '', summary: '', error: null, progress: null, game: game === 'active' ? activeGame.game : game, jargon: null, destroyed: false, gamepad: { status: 'disabled', controller: null, controls: [] }, demonstrating: false };
  let captions = options.captions ?? false;
  let consentPrompt = false;
  let runtime: LocalRuntime | undefined;
  let pending: Promise<void> | undefined;
  let whisper: WhisperRuntime | undefined;
  let prefetching = false;
  let prefetchNotice = '';
  const assertLive = () => { if (state.destroyed) throw Error('Sidekick has been destroyed. Mount a new instance.'); };
  const requireControl = (id: string) => { if (!byId.has(id)) throw Error(`Unknown control: ${id}`); return byId.get(id)!; };
  const emit = (event: SidekickEvent) => events.dispatchEvent(new CustomEvent('sidekick', { detail: structuredClone(event) }));
  function render() {
    const available = [...Object.keys(localModelLabels).map(model => ({ mode: 'local' as const, model: model as keyof typeof tutorModels })), ...remoteModels];
    const models = [...new Map(available.map(model => [modelKey(model), model])).values()];
    settings?.update(state.model, models, state.game, !!pending || state.phase === 'downloading', catalogStatus);
    const phase = state.phase;
    const loading = phase === 'downloading';
    button.disabled = loading;
    exit.hidden = !state.demonstrating;
    button.classList.toggle('listening', phase === 'listening');
    button.classList.toggle('busy', ['thinking','transcribing','speaking'].includes(phase));
    button.setAttribute('aria-pressed', String(phase === 'listening'));
    label.textContent = loading ? 'Loading…' : phase === 'listening' ? 'Finish' : phase === 'transcribing' ? 'Transcribing…' : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Interrupt' : consentPrompt ? remote ? 'Enable remote tutor' : 'Download local voice' : 'Record';
    button.setAttribute('aria-label', phase === 'listening' ? 'Finish recording' : loading ? 'Setting up voice' : consentPrompt ? remote ? 'Enable remote tutor and local speech' : 'Download local voice models' : state.mode !== 'development' ? 'Start recording' : remote ? 'Set up remote tutor and local speech' : 'Set up local voice');
    find('.demo-note').hidden = state.mode !== 'development';
    const progress = `${state.progress?.stage ?? 'Loading local voice'}${state.progress?.progress === undefined ? '' : ` · ${Math.round(state.progress.progress)}%`}`;
    const remoteNotice = inference.mode === 'remote' ? `Remote tutor · ${inference.model}. Transcripts and game/conversation context are sent to the configured provider; audio stays on your device.` : '';
    notice.textContent = state.error ?? (loading ? `${progress}. ${remote ? remoteNotice + ' Downloading local speech models.' : 'Downloading local voice models (about 1 GB). Audio stays on your device; Record is available when ready.'}` : consentPrompt ? remote ? `${remoteNotice} Download local speech models to record. Downloads may be large and take several minutes.` : 'Download local voice models to record. Downloads may be large and take several minutes. Audio stays on your device.' : phase === 'listening' ? 'Listening. Click again to finish.' : prefetching ? `Preloading Whisper speech recognition · ${progress}. You can still explore the controller.` : prefetchNotice || (remote ? remoteNotice : ''));
    notice.hidden = !notice.textContent;
    summary.textContent = state.summary;
    summary.hidden = !state.summary;
    caption.textContent = state.caption;
    caption.hidden = !captions || !state.caption;
  }
  function startWhisper() {
    if (whisper) return whisper;
    const revision = setupRevision;
    prefetching = true; prefetchNotice = '';
    state.progress = { stage: 'Whisper · downloading speech recognition' }; render();
    let created: WhisperRuntime;
    try { created = prefetchWhisper(progress => {
      if (state.destroyed || revision !== setupRevision) return;
      // Recognition finishes before the large models start; share progress with the foreground setup.
      state.progress = progress; render(); emit({ type: 'progress', progress });
    },AbortSignal.any([abort.signal, setupAbort.signal]),performance.audioBackend); } catch (error) {
      prefetching = false; state.progress = null;
      prefetchNotice = 'Speech recognition could not preload. Record to retry voice setup.'; render();
      throw error;
    }
    whisper = created;
    void created.ready.then(() => {
      if (state.destroyed || revision !== setupRevision || whisper !== created) return;
      prefetching = false;
      if (!pending) { state.progress = null; render(); }
    }).catch(() => {
      if (state.destroyed || whisper !== created) return;
      created.dispose(); whisper = undefined; prefetching = false;
      if (!pending) { state.progress = null; prefetchNotice = 'Speech recognition could not preload. Record to retry voice setup.'; render(); }
    });
    return created;
  }
  function applyLesson() {
    scene.showHints(state.lesson?.hints ?? true);
    if (state.lesson && !state.lesson.complete) scene.highlight(state.lesson.hints ? state.lesson.target : undefined);
    emit({ type: 'lesson', lesson: state.lesson });
  }
  function select(id: string, source: InputSource) {
    assertLive(); const c = requireControl(id);
    if (!pending) voice.stop();
    player.stop();
    state.selectedControl = id;
    if (source === 'virtual') player.showSpokenStep({ action: c.motion === 'trigger' ? 'squeeze' : 'press', controlId: id, say: c.description },1100);
    state.lesson = transitionLesson(state.lesson, { type: 'input', controlId: id, source });
    state.caption = c.description;
    state.summary = instructionSummary({ spoken: c.description, action: c.motion === 'trigger' ? 'squeeze' : 'highlight', controlId: id });
    if (source === 'virtual') applyLesson();
    else { scene.showHints(state.lesson?.hints ?? true); emit({ type: 'lesson', lesson: state.lesson }); }
    render(); emit({ type: 'selection', controlId: id, source });
  }
  let scene: ControllerScene;
  try {
    scene = new ControllerScene(find('.scene'), id => select(id, 'virtual'), view => emit({ type: 'view', view }));
  } catch (error) { root.replaceChildren(); activeMounts.delete(container); throw error; }
  const credit = find<HTMLAnchorElement>('.credit');
  credit.href = 'https://skfb.ly/opKOx'; credit.title = `3D model: ${manifest.credit}`; credit.textContent = 'DualSense model by AHarmlessPotato · CC BY 4.0';
  if (manifest.asset) scene.loadAsset(manifest.asset).catch((error: unknown) => {
    if (state.destroyed) return;
    scene.showPlaceholder(); state.error = `The controller model could not load: ${error instanceof Error ? error.message : String(error)}`;
    render(); emit({ type: 'error', message: state.error });
  });
  const player = new DemonstrationPlayer((step,durationMs) => {
    scene.demonstrate(step,durationMs); state.selectedControl = step.controlId;
  }, () => scene.clearDemonstration(),options.playback,active => {
    state.demonstrating = active;
    activeDemonstrations.delete(container);
    if (active && !state.destroyed) activeDemonstrations.add(container);
    if (!state.destroyed) render();
  });
  const voice = new VoiceOrchestrator(event => {
    if (state.destroyed) return;
    if (event.type === 'phase') {
      if (['listening','transcribing','thinking'].includes(event.phase)) state.summary = '';
      state.phase = event.phase; if (event.phase !== 'error') state.error = null; if (event.phase !== 'speaking') player.stop(); }
    if (event.type === 'error') { state.error = event.message; player.stop(); }
    if (event.type === 'reply') {
      state.caption = event.reply.spoken;
      state.summary = instructionSummary(event.reply);
      state.game = runtime?.getGame() ?? state.game;
      state.jargon = 'jargon' in event.reply ? event.reply.jargon : null;
      if ('exercise' in event.reply && event.reply.exercise && event.reply.controlId) {
        state.lesson = transitionLesson(state.lesson, { type: 'start', kind: event.reply.exercise, target: event.reply.controlId });
        applyLesson();
      }
    }
    if (event.type === 'step') { state.caption = event.step.say; player.showSpokenStep(event.step,event.durationMs); }
    if (event.type === 'demonstration') player.start(event.steps,event.completedPasses);
    render(); emit(event);
  });
  const physical = new PhysicalInput(id => select(id, 'physical'), message => emit({ type: 'gamepad', message }), snapshot => {
    const wasActive = state.gamepad.controls.some(inputActive);
    state.gamepad = structuredClone(snapshot);
    if (state.destroyed) return;
    if (!wasActive && snapshot.controls.some(inputActive)) player.stop();
    scene.setPhysicalInput(snapshot.controls);
    emit({ type: 'gamepad-input', state: snapshot });
  });
  const api: Sidekick = {
    getState: () => structuredClone(state),
    getControls: () => structuredClone(controls),
    on(listener) {
      assertLive();
      const handler: EventListener = event => listener(structuredClone((event as CustomEvent<SidekickEvent>).detail));
      subscriptions.add(handler); events.addEventListener('sidekick', handler);
      return () => { subscriptions.delete(handler); events.removeEventListener('sidekick', handler); };
    },
    initializeVoice(consent) {
      assertLive();
      if (consent?.consent !== true) return Promise.reject(Error('Explicit consent is required before voice setup and remote inference, when selected.'));
      if (pending) return pending;
      if (runtime) return Promise.resolve();
      const revision = setupRevision;
      const signal = AbortSignal.any([abort.signal, setupAbort.signal]);
      const selectedInference = inference, selectedPerformance = { ...performance };
      consentPrompt = false; voice.beginDownload();
      pending = (async () => {
        try {
          const unsupported = await capabilities(selectedInference.mode);
          signal.throwIfAborted();
          if (unsupported) throw Error(unsupported);
          const recognition = startWhisper();
          const onProgress = (progress: Progress) => {
            if (state.destroyed || revision !== setupRevision) return;
            state.progress = progress; render(); emit({ type: 'progress', progress });
          };
          const setupGame = game;
          const loaded = selectedInference.mode === 'remote'
            ? await loadRemote(onProgress,signal,setupGame,selectedPerformance,recognition,selectedInference)
            : await loadLocal(onProgress,signal,game,selectedPerformance,recognition);
          if (state.destroyed || revision !== setupRevision) { loaded.dispose(); throw new DOMException('Voice setup cancelled.', 'AbortError'); }
          try { if (game !== setupGame) loaded.setGame(game); } catch (error) { loaded.dispose(); throw error; }
          runtime = loaded; voice.adapters = loaded.adapters; state.mode = selectedInference.mode; state.progress = null; state.game = loaded.getGame();
          voice.finishDownload(); emit({ type: 'mode', mode: state.mode });
        } catch (error) {
          if (revision === setupRevision) {
            whisper?.dispose(); whisper = undefined; prefetching = false;
            if (!state.destroyed) { state.progress = null; voice.downloadFailed(error); }
          }
          throw error;
        } finally { if (revision === setupRevision) { pending = undefined; if (!state.destroyed) render(); } }
      })();
      return pending;
    },
    startRecording() { assertLive(); if (pending) return Promise.reject(Error('Wait for voice setup to finish loading.')); return voice.startRecording(); },
    finishRecording() { assertLive(); voice.finishRecording(); },
    ask(text) {
      assertLive();
      if (typeof text !== 'string' || text.length > 1200) throw Error('Question must be text of at most 1200 characters.');
      if (pending) throw Error('Wait for voice setup to finish loading.');
      if (remote && state.mode !== 'remote') throw Error('Initialize the remote tutor with consent before asking questions.');
      voice.ask(text);
    },
    stop() {
      assertLive(); if (!pending) voice.stop();
      player.stop(); scene.clear(); state.selectedControl = null;
      render();
    },
    repeat() { assertLive(); if (!pending) voice.repeat(); },
    highlight(id) { assertLive(); if (id !== null) requireControl(id); player.stop(); state.selectedControl = id; if (id) player.showSpokenStep({ action: 'highlight', controlId: id, say: requireControl(id).description },1100); },
    selectControl(id) { select(id, 'virtual'); },
    action(reply) { assertLive(); const validated = validateReply(reply); if (pending) throw Error('Wait for voice setup to finish loading.'); voice.stop(); state.summary = instructionSummary(validated); render(); player.start(replySteps(validated)); },
    setView(view) { assertLive(); if (!['front','shoulders','rear'].includes(view)) throw Error('Unsupported camera view.'); scene.view(view); },
    startExercise(kind, id) {
      assertLive(); const c = requireControl(id);
      if (!['find','click','practise'].includes(kind)) throw Error('Unsupported exercise.');
      if (kind === 'click' && c.motion !== 'stick') throw Error('Stick-click exercises need a stick.');
      if (pending) throw Error('Wait for voice setup to finish loading.');
      voice.stop(); state.summary = kind === 'click' ? `Press ${c.label} straight down.` : `Find ${c.label} on the controller.`; state.lesson = transitionLesson(state.lesson, { type: 'start', kind, target: id }); applyLesson(); render();
      if (kind === 'click') player.showSpokenStep({ action: 'press', controlId: id, say: c.description },1100);
    },
    setHints(enabled) { assertLive(); state.lesson = transitionLesson(state.lesson, { type: 'hints', enabled }); applyLesson(); },
    setCaptions(enabled) { assertLive(); captions = enabled; render(); },
    setGame(selection) {
      assertLive(); checkGame(selection);
      if (!pending) voice.resetConversation();
      runtime?.setGame(selection); game = selection;
      state.game = runtime ? runtime.getGame() : selection === 'active' ? activeGame.game : selection;
      state.jargon = null; state.caption = ''; state.summary = ''; state.lesson = null; applyLesson(); render();
      emit({ type: 'settings', model: state.model, game: state.game });
    },
    setModel(selection) {
      assertLive();
      const selected = validateModelSelection(selection);
      if (modelKey(selected) === modelKey(state.model)) return;
      setupRevision++; setupAbort.abort(); setupAbort = new AbortController(); pending = undefined;
      voice.resetConversation(); voice.adapters = undefined;
      player.stop(); scene.clear(); runtime?.dispose(); runtime = undefined; whisper?.dispose(); whisper = undefined;
      prefetching = false; prefetchNotice = ''; game = state.game;
      inference = selected.mode === 'remote' ? selected : { mode: 'local' };
      remote = selected.mode === 'remote';
      if (selected.mode === 'local') performance = { ...performance, tutor: selected.model };
      else remoteModels.push(selected);
      state.model = selected; state.mode = 'development'; state.progress = null; state.error = null;
      state.caption = ''; state.summary = ''; state.jargon = null; state.lesson = null; state.selectedControl = null;
      consentPrompt = true; applyLesson(); render();
      emit({ type: 'mode', mode: 'development' }); emit({ type: 'settings', model: selected, game: state.game });
    },
    setPlayback(settings) { assertLive(); player.configure(settings); },
    enableGamepad(enabled) { assertLive(); if (enabled) physical.start(); else physical.stop(); },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true; setupAbort.abort(); activeDemonstrations.delete(container); abort.abort(); player.stop(); voice.dispose(); runtime?.dispose(); whisper?.dispose(); physical.stop(); scene.dispose();
      emit({ type: 'destroyed' });
      for (const listener of subscriptions) events.removeEventListener('sidekick', listener);
      subscriptions.clear(); root.replaceChildren(); activeMounts.delete(container);
    },
  };
  exit.onclick = () => {
    const focused = root.activeElement === exit;
    api.stop();
    if (focused) button.focus({ preventScroll: true });
  };
  document.addEventListener('keydown',event => {
    if (event.key !== 'Escape' || event.defaultPrevented || Array.from(activeDemonstrations).at(-1) !== container) return;
    event.preventDefault();
    const focused = root.activeElement === exit;
    api.stop();
    if (focused) button.focus({ preventScroll: true });
  },{ signal: abort.signal });
  button.onclick = () => {
    if (state.mode === 'development') {
      if (!consentPrompt) { consentPrompt = true; render(); return; }
      void api.initializeVoice({ consent: true }).catch(() => { /* Error is displayed and emitted. */ });
    } else if (state.phase === 'listening') api.finishRecording();
    else void api.startRecording();
  };
  // A phone may background the page mid-loop or mid-inference. Never keep a demonstration running there.
  const visibility = () => { if (document.hidden) api.stop(); };
  document.addEventListener('visibilitychange',visibility,{ signal: abort.signal });
  // Accessible controls stay off screen until keyboard focus enters the group.
  for (const c of controls) {
    const control = document.createElement('button'); control.type = 'button';
    control.textContent = `${c.label} · ${c.aliases.join(', ')}`;
    control.onclick = () => api.selectControl(c.id); find('.control-access').append(control);
  }
  settings = createSettings(root, {
    games: activeGame.available_games.map(id => ({ id, name: activeGame.game_names[id as keyof typeof activeGame.game_names] ?? id })),
    onModel: model => api.setModel(model), onGame: game => api.setGame(game), signal: abort.signal,
    onOpen() {
      if (!catalogEndpoint || catalogLoaded || catalogLoading) return;
      catalogLoading = true; catalogStatus = 'Loading remote models…'; render();
      void (async () => {
        try {
          const response = await fetch(catalogEndpoint, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]), credentials: 'same-origin' });
          if (!response.ok) throw Error('Catalog unavailable');
          const result = await response.json();
          if (!Array.isArray(result?.models) || result.models.length > 100) throw Error('Invalid catalog');
          const discovered = result.models.map((model: import('./voice/remote').RemoteInferenceOptions) => {
            if (model?.mode !== 'remote') throw Error('Invalid remote model');
            return validateModelSelection(model);
          });
          if (state.destroyed) return;
          remoteModels.push(...discovered); catalogLoaded = true;
          catalogStatus = discovered.length ? '' : 'Remote models are not configured on this server.';
        } catch { if (!state.destroyed) catalogStatus = 'Remote models could not load. Reopen Settings to retry.'; }
        finally { catalogLoading = false; if (!state.destroyed) render(); }
      })();
    },
  });
  render();
  if (options.gamepad !== false) physical.start();
  if (options.autoInitializeVoice === true) {
    // This explicit host opt-in is authorization to download, never to record or play audio.
    void api.initializeVoice({ consent: true }).catch(() => { /* Contextual error is already shown; exploration remains available. */ });
  } else if (options.prefetchWhisper !== false) {
    void capabilities(inference.mode).then(unsupported => {
      if (!unsupported && !state.destroyed && !pending && !runtime) startWhisper();
    }).catch(() => { /* An unsupported browser must keep controller exploration working. */ });
  }
  return api;
}
