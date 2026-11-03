import styles from './style.css?inline';
import { ControllerScene } from './controller/scene';
import { byId, controls, type View } from './controller/manifest';
import { PhysicalInput } from './controller/gamepad';
import { transitionLesson, type Lesson, type LessonKind, type InputSource } from './tutor/lesson';
import { validateReply, replySteps, type TutorReply } from './tutor/schema';
import { DemonstrationPlayer, playbackOptions, type PlaybackOptions } from './tutor/playback';
import type { GameSelection } from './tutor/knowledge';
import activeGame from '../knowledge/active-game.json';
import { VoiceOrchestrator } from './voice/orchestrator';
import { capabilities, loadLocal, type LocalRuntime } from './voice/local';
import type { Phase, Progress, VoiceEvent } from './voice/types';

export interface SidekickOptions {
  /** Show spoken replies below the controller. The host can render captions from reply events instead. */
  captions?: boolean;
  /** No game is selected by default. 'active' explicitly selects the pack configuration. */
  game?: GameSelection;
  playback?: PlaybackOptions;
}
export interface SidekickState {
  phase: Phase;
  mode: 'development' | 'local';
  selectedControl: string | null;
  lesson: Lesson | null;
  caption: string;
  error: string | null;
  progress: Progress | null;
  game: string | null;
  jargon: { term: string; means: string } | null;
  destroyed: boolean;
}
export type SidekickEvent = VoiceEvent
  | { type: 'progress'; progress: Progress }
  | { type: 'mode'; mode: SidekickState['mode'] }
  | { type: 'selection'; controlId: string; source: InputSource }
  | { type: 'lesson'; lesson: Lesson | null }
  | { type: 'view'; view: View }
  | { type: 'gamepad'; message: string }
  | { type: 'destroyed' };
export interface Sidekick {
  getState(): SidekickState;
  getControls(): typeof controls;
  on(listener: (event: SidekickEvent) => void): () => void;
  /** Call after displaying first-use download information and receiving consent. */
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
  setPlayback(options: PlaybackOptions): void;
  enableGamepad(enabled: boolean): void;
  destroy(): void;
}

const ownedRoots = new WeakMap<HTMLElement, ShadowRoot>();
const activeMounts = new WeakSet<HTMLElement>();

/** Mount one isolated component. The host owns its dimensions and surrounding UI. */
export function createSidekick(container: HTMLElement, options: SidekickOptions = {}): Sidekick {
  playbackOptions(options.playback);
  const checkGame = (game: GameSelection) => { if (game !== null && game !== 'active' && !activeGame.available_games.includes(game)) throw Error(`Unknown game: ${game}`); };
  let game: GameSelection = options.game ?? null;
  checkGame(game);
  if (activeMounts.has(container) || (container.shadowRoot && !ownedRoots.has(container))) throw Error('Sidekick needs an unused mount element.');
  const root = ownedRoots.get(container) ?? container.attachShadow({ mode: 'open' });
  ownedRoots.set(container, root); activeMounts.add(container);
  root.innerHTML = `<style>${styles}</style><section class="sidekick" aria-label="Controller tutor">
    <span class="asset-note">Temporary controller · text demo</span>
    <div class="scene"></div>
    <div class="record-area"><p class="notice" role="status" aria-live="polite" hidden></p>
    <p class="caption" aria-live="polite" hidden></p>
    <button class="record" type="button" aria-label="Set up local voice" aria-pressed="false">
      <svg class="mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M8 21h8"/></svg>
      <span class="record-label">Record</span>
    </button></div>
    <div class="control-access" role="group" aria-label="Controller controls"></div>
  </section>`;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const button = find<HTMLButtonElement>('.record');
  const notice = find('.notice');
  const caption = find('.caption');
  const label = find('.record-label');
  const events = new EventTarget();
  const subscriptions = new Set<EventListener>();
  const abort = new AbortController();
  let state: SidekickState = { phase: 'ready', mode: 'development', selectedControl: null, lesson: null, caption: '', error: null, progress: null, game: game === 'active' ? activeGame.game : game, jargon: null, destroyed: false };
  let captions = options.captions ?? false;
  let consentPrompt = false;
  let runtime: LocalRuntime | undefined;
  let pending: Promise<void> | undefined;
  const assertLive = () => { if (state.destroyed) throw Error('Sidekick has been destroyed. Mount a new instance.'); };
  const requireControl = (id: string) => { if (!byId.has(id)) throw Error(`Unknown control: ${id}`); return byId.get(id)!; };
  const emit = (event: SidekickEvent) => events.dispatchEvent(new CustomEvent('sidekick', { detail: structuredClone(event) }));
  function render() {
    const phase = state.phase;
    const loading = phase === 'downloading';
    button.disabled = loading;
    button.classList.toggle('listening', phase === 'listening');
    button.classList.toggle('busy', ['thinking','transcribing','speaking'].includes(phase));
    button.setAttribute('aria-pressed', String(phase === 'listening'));
    label.textContent = loading ? 'Loading…' : phase === 'listening' ? 'Finish' : phase === 'transcribing' ? 'Transcribing…' : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Interrupt' : consentPrompt ? 'Download local voice' : 'Record';
    button.setAttribute('aria-label', phase === 'listening' ? 'Finish recording' : loading ? 'Downloading local voice models' : consentPrompt ? 'Download local voice models' : state.mode === 'local' ? 'Start recording' : 'Set up local voice');
    find('.asset-note').textContent = state.mode === 'local' ? 'Temporary controller' : 'Temporary controller · text demo';
    notice.textContent = state.error ?? (loading ? `${state.progress?.stage ?? 'Loading local voice'}${state.progress?.progress === undefined ? '' : ` · ${Math.round(state.progress.progress)}%`}` : consentPrompt ? 'Download local voice models to record. Downloads may be large and take several minutes. Audio stays on your device.' : phase === 'listening' ? 'Listening. Click again to finish.' : '');
    notice.hidden = !notice.textContent;
    caption.textContent = state.caption;
    caption.hidden = !captions || !state.caption;
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
    scene.highlight(id); scene.animate(id, c.motion === 'trigger' ? 'squeeze' : 'press');
    state.lesson = transitionLesson(state.lesson, { type: 'input', controlId: id, source });
    state.caption = c.description;
    applyLesson(); render(); emit({ type: 'selection', controlId: id, source });
  }
  let scene: ControllerScene;
  try {
    scene = new ControllerScene(find('.scene'), id => select(id, 'virtual'), view => emit({ type: 'view', view }));
  } catch (error) { root.replaceChildren(); activeMounts.delete(container); throw error; }
  const player = new DemonstrationPlayer((step,durationMs) => {
    scene.demonstrate(step,durationMs); state.selectedControl = step.controlId;
  }, () => scene.clearDemonstration(),options.playback);
  const voice = new VoiceOrchestrator(event => {
    if (state.destroyed) return;
    if (event.type === 'phase') { state.phase = event.phase; if (event.phase !== 'error') state.error = null; if (event.phase !== 'speaking') player.stop(); }
    if (event.type === 'error') { state.error = event.message; player.stop(); }
    if (event.type === 'reply') {
      state.caption = event.reply.spoken;
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
  const physical = new PhysicalInput(id => select(id, 'physical'), message => emit({ type: 'gamepad', message }));
  const api: Sidekick = {
    getState: () => structuredClone(state),
    getControls: () => structuredClone(controls),
    on(listener) {
      assertLive();
      const handler: EventListener = event => listener(structuredClone((event as CustomEvent<SidekickEvent>).detail));
      subscriptions.add(handler); events.addEventListener('sidekick', handler);
      return () => { subscriptions.delete(handler); events.removeEventListener('sidekick', handler); };
    },
    initializeVoice(settings) {
      assertLive();
      if (settings?.consent !== true) return Promise.reject(Error('Explicit consent is required before downloading local voice models.'));
      if (pending) return pending;
      if (runtime) return Promise.resolve();
      consentPrompt = false; voice.beginDownload();
      pending = (async () => {
        try {
          const unsupported = await capabilities();
          if (unsupported) throw Error(unsupported);
          abort.signal.throwIfAborted();
          const loaded = await loadLocal(progress => {
            if (state.destroyed) return;
            state.progress = progress; render(); emit({ type: 'progress', progress });
          }, abort.signal,game);
          if (state.destroyed) { loaded.dispose(); throw new DOMException('Voice setup cancelled.', 'AbortError'); }
          runtime = loaded; voice.adapters = loaded.adapters; state.mode = 'local'; state.progress = null; state.game = loaded.getGame();
          voice.finishDownload(); emit({ type: 'mode', mode: 'local' });
        } catch (error) {
          if (!state.destroyed) { state.progress = null; voice.downloadFailed(error); }
          throw error;
        } finally { pending = undefined; }
      })();
      return pending;
    },
    startRecording() { assertLive(); if (pending) return Promise.reject(Error('Wait for local voice to finish loading.')); return voice.startRecording(); },
    finishRecording() { assertLive(); voice.finishRecording(); },
    ask(text) {
      assertLive();
      if (typeof text !== 'string' || text.length > 1200) throw Error('Question must be text of at most 1200 characters.');
      if (pending) throw Error('Wait for local voice to finish loading.');
      voice.ask(text);
    },
    stop() { assertLive(); if (!pending) voice.stop(); },
    repeat() { assertLive(); if (!pending) voice.repeat(); },
    highlight(id) { assertLive(); if (id !== null) requireControl(id); player.stop(); state.selectedControl = id; scene.highlight(id ?? undefined); },
    selectControl(id) { select(id, 'virtual'); },
    action(reply) { assertLive(); const validated = validateReply(reply); if (pending) throw Error('Wait for local voice to finish loading.'); voice.stop(); player.start(replySteps(validated)); },
    setView(view) { assertLive(); if (!['front','shoulders','rear'].includes(view)) throw Error('Unsupported camera view.'); scene.view(view); },
    startExercise(kind, id) {
      assertLive(); const c = requireControl(id);
      if (!['find','click','practise'].includes(kind)) throw Error('Unsupported exercise.');
      if (kind === 'click' && c.motion !== 'stick') throw Error('Stick-click exercises need a stick.');
      if (pending) throw Error('Wait for local voice to finish loading.');
      voice.stop(); state.lesson = transitionLesson(state.lesson, { type: 'start', kind, target: id }); applyLesson();
      if (kind === 'click') scene.animate(id);
    },
    setHints(enabled) { assertLive(); state.lesson = transitionLesson(state.lesson, { type: 'hints', enabled }); applyLesson(); },
    setCaptions(enabled) { assertLive(); captions = enabled; render(); },
    setGame(selection) {
      assertLive(); checkGame(selection);
      if (pending) throw Error('Wait for local voice to finish loading.');
      voice.resetConversation(); runtime?.setGame(selection); game = selection;
      state.game = runtime ? runtime.getGame() : selection === 'active' ? activeGame.game : selection;
      state.jargon = null; state.caption = ''; state.lesson = null; applyLesson(); render();
    },
    setPlayback(settings) { assertLive(); player.configure(settings); },
    enableGamepad(enabled) { assertLive(); physical.stop(); if (enabled) physical.start(); },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true; abort.abort(); player.stop(); voice.dispose(); runtime?.dispose(); physical.stop(); scene.dispose();
      emit({ type: 'destroyed' });
      for (const listener of subscriptions) events.removeEventListener('sidekick', listener);
      subscriptions.clear(); root.replaceChildren(); activeMounts.delete(container);
    },
  };
  button.onclick = () => {
    if (state.mode !== 'local') {
      if (!consentPrompt) { consentPrompt = true; render(); return; }
      void api.initializeVoice({ consent: true }).catch(() => { /* Error is displayed and emitted. */ });
    } else if (state.phase === 'listening') api.finishRecording();
    else void api.startRecording();
  };
  // A phone may background the page mid-loop or mid-inference. Never keep a demonstration running there.
  const visibility = () => { if (document.hidden && !pending) { voice.stop(); player.stop(); } };
  document.addEventListener('visibilitychange',visibility,{ signal: abort.signal });
  // Accessible controls stay off screen until keyboard focus enters the group.
  for (const c of controls) {
    const control = document.createElement('button'); control.type = 'button';
    control.textContent = `${c.label} · ${c.aliases.join(', ')}`;
    control.onclick = () => api.selectControl(c.id); find('.control-access').append(control);
  }
  render();
  return api;
}
