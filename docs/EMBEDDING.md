# Embedding Sidekick

The embedded unit contains an interactive controller and a Record button. An X appears while a demonstration is active. Click it or press Escape to stop the animation and narration, clear the highlight and ease back to the front view. Escape is left alone when no demonstration is active; with multiple active instances it closes the most recently active one. Captions are off by default. Consent, loading, listening and errors appear as short contextual messages.

## Build and mount

Run `npm ci` and `npm run build`. Deploy the **entire `dist/` directory**, preserving relative paths, on the host site's origin. `dist/sidekick.js` is the public ESM entry, `dist/types/index.d.ts` contains types, and sibling `assets/` contains shared chunks, workers and WASM. Copying only the entry file will not work. Recognition weights preload by default; the large model downloads require consent or explicit host opt-in as described below. Do not serve worker scripts from a different origin. No npm package is published yet; the repository package export points to the built entry for local integration.

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

The host controls dimensions, with a minimum height of 280px. Shadow DOM isolates styles, labels and controls from the containing site. The stage defaults to a dark showcase gradient that the spotlight and bloom are tuned for; set `--sidekick-stage-background` (for example to `transparent`) and `--sidekick-stage-radius` on the mount element to change it. Typography uses system fonts, with no font requests. Set `--sidekick-button-background` and `--sidekick-button-color` on the mount element to customise the button. All DOM lookups are instance-local. Calling `destroy()` releases the renderer, resize observer, audio context, model workers, recording streams and gamepad polling; it is idempotent. The same element may be mounted again after destruction. Multiple instances can be mounted, but each model runtime consumes its own memory; prefer one active voice instance.

The example page also exposes `window.sidekick` for development console calls. The reusable ESM module does **not** create a global or mount itself.

## Public API

All functions are typed through `Sidekick` and `createSidekick`. Calls after destruction throw, except `getState()`, `getControls()` and repeated `destroy()`. Unknown IDs, camera views, exercise kinds and invalid actions are rejected at the public boundary. `getState()` and `getControls()` return independent snapshots, not mutable internal objects.

| Function | Behaviour |
| --- | --- |
| `initializeVoice({ consent: true })` | Explicitly download/cache and initialise all three local models. Deduplicates concurrent calls, rejects on capability/download errors and emits progress. Destroying the instance aborts initialization. |
| `startRecording()` / `finishRecording()` | Start/finish a turn; first microphone access follows the host's user gesture. Finish while permission is pending cancels the request. |
| `ask(text)` | Submit up to 1200 characters. Uses the labelled deterministic tutor until local voice has been explicitly initialised. Local mode generates and speaks on device. |
| `stop()` / `repeat()` | Stop the current turn, animation and narration, clear the highlight and ease back to front; or repeat the last valid reply and its steps. Stop does not cancel model setup; destroy the instance to abort setup. |
| `highlight(controlIdOrNull)` | Highlight/reveal a control or clear the highlight. |
| `selectControl(controlId)` | Treat host UI selection as **virtual** input; animate it and update the exercise. This cannot forge a confirmed physical press. |
| `action(reply)` | Execute a validated structured controller action, without generating or speaking text. `spoken` is required by the shared schema but is not spoken by this function. |
| `setView('front' \| 'shoulders' \| 'rear')` | Move the camera. |
| `startExercise('find' \| 'click' \| 'practise', controlId)` | Start application-owned practice. `click` requires a stick. |
| `setHints(boolean)` | Show/hide the current exercise's hint. |
| `setCaptions(boolean)` | Opt into captions inside the component; alternatively render host captions from reply events. |
| `setGame(gameOrNull)` | Explicitly select `overcooked2`, `fortnite`, or `active` (the runtime pack configuration); `null` restores controller-only mode. Cancels playback and clears conversation/lesson state. Local questions that name an available game also establish context. |
| `setPlayback({ speed, maxRepeats })` | Set animation speed (`slow`, `medium`, `fast`) and total visual passes (positive integer or `null` for unlimited). Defaults: medium/unlimited. Cancels the current demonstration; settings apply to the next one. Narration is spoken once, independently of silent visual repeats. |
| `enableGamepad(boolean)` | Enable/disable live standard-mapped Gamepad API input. Enabled by default; disabling clears held controls. |
| `getState()` / `getControls()` | Inspect phase, mode, selected control, lesson, caption, error, download progress, `demonstrating` and controller facts. |
| `on(listener)` | Subscribe to typed events; returns an unsubscribe function. |
| `destroy()` | Abort and release resources, clear the component, emit `destroyed`, detach subscriptions. |

The event union includes `phase`, `progress`, `mode`, `transcript`, `reply`, `error`, `timing`, `selection`, `lesson`, `view`, `gamepad`, `gamepad-input` and `destroyed`. Host text input, captions, stop/repeat and lesson UI can be completely separate from the embedded view. Virtual and physical input remain distinguishable through selection and lesson events. Permission, model and inference errors are emitted and shown in the component. Synchronous validation errors throw; initialization errors also reject its promise. Questions and recording requests during setup are rejected.

## Live controller feedback

Pair the controller with macOS through Bluetooth (or connect over USB), open the focused Sidekick page over HTTPS or localhost, then press a controller button to let the browser expose the device. This uses `navigator.getGamepads()`; the application does not pair Bluetooth devices itself. Live input starts on mount and needs no voice models or downloads. Mount with `{ gamepad: false }` to opt out, or call `enableGamepad(false)` later. No connection panel, button or status element is added to the embedded view.

Buttons remain depressed while held; triggers use their 0–1 values; sticks tilt in both axes with a radial 12% dead zone rescaled to full travel. Stick clicks remain separate physical button events. Multiple controls can move and highlight simultaneously. Active input takes visual priority over demonstrations and stops an existing visual loop when activity begins. It does not automatically change camera view. Reduced motion retains highlights while leaving the model transforms at rest.

`getState().gamepad` contains `status`, `controller` (`index`, browser-provided `id`, `mapping`, or `null`) and `controls`. Status is `disabled`, `waiting`, `connected`, `unsupported`, `unavailable`, or `suspended`. Each mapped control has `controlId`, `pressed`, `value`, and, for sticks, `axes: [x, y]` (right/down positive). State contains all mapped controls, including neutral values; unmapped touchpad/mute input is omitted. `gamepad-input` events carry `{ type: 'gamepad-input', state }` only when this snapshot changes. The existing `gamepad` event carries a descriptive message on enabled status transitions. Initial events happen during mount, so use `getState().gamepad` after subscribing for the initial snapshot. Snapshots contain device identifiers only in memory; nothing is uploaded or persisted.

The first available standard-mapped device is selected and retained until it disconnects; additional devices are not merged. Unsupported mappings never drive the PS5 model. Standard mapping represents button positions, not device-specific branding: this revision displays the existing PS5 labels even for other standard-mapped controllers. Controller-specific artwork/profiles and a device selector are not implemented. Buttons reserved by macOS/browser, touchpad gestures, motion sensors, haptics and adaptive triggers are not guaranteed or implemented.

The first sample on connection, re-enabling or return from a hidden page establishes a baseline. Held inputs render immediately but do not count as new physical presses for exercises. Subsequent press edges emit physical `selection` events; stick tilt alone cannot complete a stick-click exercise. Disconnect, disable and backgrounding clear live state; backgrounding pauses polling and returning resumes it. `destroy()` removes the input listeners and cancels polling. A browser policy error or missing API emits `unavailable` without claiming a controller connection. An iframe host must permit the `gamepad` Permissions Policy feature. Actual macOS Bluetooth/browser compatibility still requires a physical-device check.

```ts
const tutor = createSidekick(container); // Live controller feedback is on.
const off = tutor.on(event => {
  if (event.type === 'gamepad-input') console.log(event.state);
});
console.log(tutor.getState().gamepad); // Initial snapshot.
// tutor.enableGamepad(false);
// off(); tutor.destroy();
```

Mount options also accept `game` and `playback`. Leaving `game` unset never selects the game's configured default. `setGame('active')` is an explicit request to use `knowledge/active-game.json`; changing that JSON and rebuilding switches the default pack without application-code changes. Vite emits runtime knowledge files as separate assets; deploy them alongside the ESM entry and workers. The master PS5 labels and geometry are built together.

Real local replies contain `spoken`, `found`, `actionId`, `steps`, and `jargon`. Each step contains `action`, `controlId`, `say`, and optional `hold`, `times`, `direction`. `action(reply)` accepts this multi-step format as well as the original single-action controller format; it validates the entire reply before playing it. `repeat()` replays the last validated introduction and all narrated steps. The `step` event fires when that step's audio starts, with its index and duration. `demonstration` indicates the start of silent visual repeats. State contains the selected `game` and latest `jargon`; the host owns any glossary display. Development mode remains a labelled controller fixture, with no game inference or speech.

## Voice consent and browser gestures

By default, capable browsers preload Whisper in one worker on mount and show recognition download progress without blocking controller exploration. Full setup reuses that worker and its initialization promise; it does not initialize Whisper twice. Mount with `{ prefetchWhisper: false }` to disable the background download. Unsupported browsers silently skip prefetch and retain controller exploration. A failed preload can be retried through Record.

Without host opt-in, the first Record click displays the large-download explanation, then changes to **Download local voice**. The second click initializes the remaining models using the existing Whisper worker. Setup performs no microphone capture or playback. Once ready, a Record click requests microphone permission and starts recording. Click again to finish. Busy recording/playback can be interrupted by starting a new recording. Keyboard-accessible controller buttons appear when focused with Tab.

The first-party demo mounts with `{ autoInitializeVoice: true }`. This explicit host option authorizes the full download on page open and displays progress and download-size information. Other hosts must disclose the large downloads and obtain their own authorization before enabling that option. Otherwise keep it unset and use the component's consent flow, or call `initializeVoice({ consent: true })` from a host-controlled consent action. Initialization calls are deduplicated. Destroying the instance aborts both background prefetch and foreground setup and terminates their workers. Auto-start failures are caught and displayed contextually; the controller remains usable and manual retry is available.

Downloads never grant recording/playback permission. Call `startRecording()`, local `ask()` and `repeat()` from a real user gesture to satisfy browser microphone/playback policy. Subscribing to events or highlighting a control needs no gesture.

Visual repeats remain medium/unlimited by default. X, Escape and `stop()` exit immediately and start the return to front; a finite sequence settles after 3.5 seconds of inactivity. The controller has no automatic idle rotation or floating. Manual dragging is preserved until an explicit exit or a new demonstration reframes it. The X is a 44-pixel button with a keyboard label, focus indicator and Escape shortcut. Closing it restores focus to Record when appropriate. Downloading continues if an animation is stopped during setup.

There is no network API or HTTP inference service. These are browser-side JavaScript functions. For an iframe, this version does not provide a cross-origin `postMessage` bridge; prefer direct same-origin mounting. If adding a bridge later, allowlist parent origins and commands and never permit a message alone to grant model-download consent or forge physical input.

## Host requirements

Use HTTPS or localhost, desktop Chrome with WebGPU and enough memory. Follow the COOP/COEP headers in `vite.config.ts` and serve all module/worker/WASM files with correct MIME types. The host CSP must permit its own module workers and the model asset hosts required by WebLLM, Transformers.js and Kokoro. Cross-origin iframes additionally need microphone permission policy delegation and compatible isolation; iframe voice has not been verified.

The component loads the PS5 DualSense GLB described in [ASSETS.md](ASSETS.md) and falls back to the generated placeholder (with an error notice) if it cannot load. Change models through the manifest and scene loader; the public API does not yet expose arbitrary controller manifests or hot-swapping models.
