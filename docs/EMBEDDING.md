# Embedding Sidekick

The default page is the embedded unit: an interactive controller and a Record button. There is no header, navigation, tutor panel or lesson dashboard. Temporary-model/development labels remain visible until real assets/local voice are used. Captions are off by default. Download consent, loading, listening and errors appear as short contextual messages.

## Build and mount

Run `npm ci` and `npm run build`. Deploy the **entire `dist/` directory**, preserving relative paths, on the host site's origin. `dist/sidekick.js` is the public ESM entry, `dist/types/index.d.ts` contains types, and sibling `assets/` contains shared chunks, workers and WASM. Copying only the entry file will not work. Model weights are downloaded separately after consent. Do not serve worker scripts from a different origin. No npm package is published yet; the repository package export points to the built entry for local integration.

```html
<div id="controller-tutor" style="width:100%;height:480px"></div>
<script type="module">
  import { createSidekick } from '/sidekick/sidekick.js';

  const tutor = createSidekick(document.querySelector('#controller-tutor'));
  const unsubscribe = tutor.on(event => {
    if (event.type === 'reply') console.log(event.reply.spoken);
    if (event.type === 'error') console.error(event.message);
    if (event.type === 'lesson') console.log(event.lesson);
  });

  // Wire these functions to the host's own buttons, inputs or lesson flow.
  // tutor.ask('Where is the right bumper?');
  // tutor.highlight('r1');
  // tutor.setView('shoulders');
  // tutor.startExercise('find', 'cross');
  // tutor.setHints(false);

  // On host unmount/navigation:
  // unsubscribe();
  // tutor.destroy();
</script>
```

The host controls dimensions, with a minimum height of 280px. Shadow DOM isolates styles, labels and controls from the containing site. Background is transparent and typography uses system fonts, with no font requests. Set `--sidekick-button-background` and `--sidekick-button-color` on the mount element to customise the button. All DOM lookups are instance-local. Calling `destroy()` releases the renderer, resize observer, audio context, model workers, recording streams and gamepad polling; it is idempotent. The same element may be mounted again after destruction. Multiple instances can be mounted, but each model runtime consumes its own memory; prefer one active voice instance.

The example page also exposes `window.sidekick` for development console calls. The reusable ESM module does **not** create a global or mount itself.

## Public API

All functions are typed through `Sidekick` and `createSidekick`. Calls after destruction throw, except `getState()`, `getControls()` and repeated `destroy()`. Unknown IDs, camera views, exercise kinds and invalid actions are rejected at the public boundary. `getState()` and `getControls()` return independent snapshots, not mutable internal objects.

| Function | Behaviour |
| --- | --- |
| `initializeVoice({ consent: true })` | Explicitly download/cache and initialise all three local models. Deduplicates concurrent calls, rejects on capability/download errors and emits progress. Destroying the instance aborts initialization. |
| `startRecording()` / `finishRecording()` | Start/finish a turn; first microphone access follows the host's user gesture. Finish while permission is pending cancels the request. |
| `ask(text)` | Submit up to 1200 characters. Uses the labelled deterministic tutor until local voice has been explicitly initialised. Local mode generates and speaks on device. |
| `stop()` / `repeat()` | Stop the current turn/playback or repeat the last valid spoken reply. Stop does not cancel model setup; destroy the instance to abort setup. |
| `highlight(controlIdOrNull)` | Highlight/reveal a control or clear the highlight. |
| `selectControl(controlId)` | Treat host UI selection as **virtual** input; animate it and update the exercise. This cannot forge a confirmed physical press. |
| `action(reply)` | Execute a validated structured controller action, without generating or speaking text. `spoken` is required by the shared schema but is not spoken by this function. |
| `setView('front' \| 'shoulders' \| 'rear')` | Move the camera. |
| `startExercise('find' \| 'click' \| 'practise', controlId)` | Start application-owned practice. `click` requires a stick. |
| `setHints(boolean)` | Show/hide the current exercise's hint. |
| `setCaptions(boolean)` | Opt into captions inside the component; alternatively render host captions from reply events. |
| `setGame(gameOrNull)` | Explicitly select `overcooked2`, `fortnite`, or `active` (the runtime pack configuration); `null` restores controller-only mode. Cancels playback and clears conversation/lesson state. Local questions that name an available game also establish context. |
| `setPlayback({ speed, maxRepeats })` | Set animation speed (`slow`, `medium`, `fast`) and total visual passes (positive integer or `null` for unlimited). Defaults: medium/unlimited. Cancels the current demonstration; settings apply to the next one. Narration is spoken once, independently of silent visual repeats. |
| `enableGamepad(boolean)` | Enable/disable actual standard-mapped Gamepad API input. |
| `getState()` / `getControls()` | Inspect phase, mode, selected control, lesson, caption, error, download progress and controller facts. |
| `on(listener)` | Subscribe to typed events; returns an unsubscribe function. |
| `destroy()` | Abort and release resources, clear the component, emit `destroyed`, detach subscriptions. |

The event union includes `phase`, `progress`, `mode`, `transcript`, `reply`, `error`, `timing`, `selection`, `lesson`, `view`, `gamepad` and `destroyed`. Host text input, captions, stop/repeat and lesson UI can be completely separate from the embedded view. Virtual and physical input remain distinguishable through selection and lesson events. Permission, model and inference errors are emitted and shown in the component. Synchronous validation errors throw; initialization errors also reject its promise. Questions and recording requests during setup are rejected.

Mount options also accept `game` and `playback`. Leaving `game` unset never selects the game's configured default. `setGame('active')` is an explicit request to use `knowledge/active-game.json`; changing that JSON and rebuilding switches the default pack without application-code changes. Vite emits runtime knowledge files as separate assets; deploy them alongside the ESM entry and workers. The master PS5 labels and geometry are built together.

Real local replies contain `spoken`, `found`, `actionId`, `steps`, and `jargon`. Each step contains `action`, `controlId`, `say`, and optional `hold`, `times`, `direction`. `action(reply)` accepts this multi-step format as well as the original single-action controller format; it validates the entire reply before playing it. `repeat()` replays the last validated introduction and all narrated steps. The `step` event fires when that step's audio starts, with its index and duration. `demonstration` indicates the start of silent visual repeats. State contains the selected `game` and latest `jargon`; the host owns any glossary display. Development mode remains a labelled controller fixture, with no game inference or speech.

## Voice consent and browser gestures

The default Record button first displays the download explanation, then changes to **Download local voice**. That second click explicitly downloads the models, with no microphone capture or playback. After loading it returns to Record. A later click requests the microphone and starts a recording. Click again to finish. Busy recording/playback can be interrupted by starting a new recording. Keyboard-accessible controller buttons appear when focused with Tab.

For a host-controlled setup button, display the same first-use information (large downloads, on-device processing, cache reuse) and call `initializeVoice({ consent: true })` only after consent. Do not call it automatically on page load. Call `startRecording()`, local `ask()` and `repeat()` from a real user gesture to satisfy browser microphone/playback policy. Subscribing to events or highlighting a control needs no gesture.

There is no network API or HTTP inference service. These are browser-side JavaScript functions. For an iframe, this version does not provide a cross-origin `postMessage` bridge; prefer direct same-origin mounting. If adding a bridge later, allowlist parent origins and commands and never permit a message alone to grant model-download consent or forge physical input.

## Host requirements

Use HTTPS or localhost, desktop Chrome with WebGPU and enough memory. Follow the COOP/COEP headers in `vite.config.ts` and serve all module/worker/WASM files with correct MIME types. The host CSP must permit its own module workers and the model asset hosts required by WebLLM, Transformers.js and Kokoro. Cross-origin iframes additionally need microphone permission policy delegation and compatible isolation; iframe voice has not been verified.

The temporary controller and existing manifest remain the asset scaffold. For now, integrate a real GLB through the manifest and scene loader as described in [ASSETS.md](ASSETS.md); the public API does not yet expose arbitrary controller manifests or hot-swapping models.

## Local performance profiles

```ts
const sidekick = createSidekick(element, {
  performance: {
    tutor: 'quality', // default Qwen 1.5B; experiments: 'fast' (Qwen 0.5B), 'compact' (SmolLM2 360M)
    audioBackend: 'auto', // try WebGPU, explicitly report local WASM fallback; 'wasm' for comparisons
  },
});
```

Profiles are fixed for a mounted instance. Destroy and remount to compare models; reinitialize voice after the host has obtained download consent. No model is silently downloaded before that consent. These options do not change the selected game or supply missing game knowledge.

Timing events retain `transcription`, `generation`, `synthesis`, and `firstAudible`, and add preparation/resampling time, queue wait, captured/trimmed audio duration, time to first synthesized sentence, runtime model/backend/dtype information, token counts, prefill/decode rates, time to first token and grammar initialization where WebLLM reports them. Text submissions start their latency clock at submission. `firstAudible` remains a playback scheduling estimate, not an acoustic measurement. `synthesis` accumulates model/cache request time, excluding playback. Later sentences may synthesize during earlier audio, so adding all stage durations does not represent total wall time.

Recording uses a silent AudioWorklet to collect mono PCM when available. Its module is emitted alongside the other assets; serve it as JavaScript and allow same-origin worklet loading in your CSP. MediaRecorder remains a local compatibility path. Edge silence is trimmed with a conservative energy gate and padding; internal pauses are preserved. This is not a speech detector. Recognition runs after recording ends, rather than repeatedly decoding partial utterances.

Interrupting busy ASR/TTS terminates only its worker; a later request lazily reloads that model from browser-managed asset caches. This trades reload cost for releasing cancelled compute. Idle model workers stay resident. The synthesizer maintains an 8 MiB in-memory audio cache per runtime; destroy releases it. Fully validated introductions play sentence by sentence, and the next sentence synthesizes during playback. Each action step stays a single audio unit so its visual cue remains aligned.

For repeatable real-model checks, open `performance.html` on the same local/preview host. The lab is a separate host page, not part of the embedded controller. It records synthetic audio separately from typed tutor evaluations, offers quick smoke and five-pass full suites, and lets you save results locally. Inspect actual text, control choices and failures; a structural validation pass alone is not a semantic quality score. The lab disables response caching for inference comparisons.
