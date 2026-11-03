# Verification record

Initial scaffold, 3 November 2026. This record separates automated fixture checks, real browser checks, and unverified hardware behaviour.

## Automated

- 39 tests pass: response validation, unsupported control/action rejection, lesson transitions, virtual versus physical completion, hint removal, unknown gamepad mappings, phase transitions, cancellation during generation and synthesis, stale worker messages, microphone-denial recovery, late microphone permission cleanup, download failure cleanup, unsupported WebGPU, 12 deterministic evaluation cases, plus embedding API validation, style/mount isolation, consent, initialization deduplication, aborted downloads, cleanup and remounting. Hosting checks cover mount redirects, compressed WASM responses, canonical asset redirects and isolation/microphone headers.
- TypeScript strict checking and Vite production build pass.
- npm audit reports zero known vulnerabilities with the lockfile and Sharp override.
- Production bundles include lazy model runtimes and large WASM files. Vite emits a large-chunk warning. Model runtime size and memory remain optimisation work.

Tests with fake media and adapters verify failure/cancellation logic only. They do not prove live speech recognition or model accuracy.

## Browser checks

The original scaffold production build was opened in the available embedded Chromium browser on macOS. Verified temporary 3D rendering and labels, text fixture questions for right bumper and stick clicking, the virtual stick exercise, and the explicit local model setup flow. All three real models loaded and the Kokoro warmup completed. Reloading and enabling voice again also completed with cached model assets. This does not certify offline use.

The first real Qwen generation selected a non-none action without a control ID; the application rejected it without executing it or speaking it. The generation schema was tightened so non-none actions require a control ID, alongside an explicit example in the system prompt. After that change, the real Qwen response to “Where is the right bumper?” passed validation, revealed the shoulder view, and completed real Kokoro synthesis and Web Audio playback. The browser returned to ready and emitted a timing event. The second real prompt, “What does clicking the stick mean?”, also completed with a brief straight-down-press explanation and local speech. These were typed questions, not microphone recordings. The 390px layout had a 390px scroll width with no horizontal overflow.

## Embedded revision

The UI is now a minimal Shadow DOM component with a Record button and a public ESM API. The production build, generated TypeScript declarations, and import of the built public entry without a browser DOM pass. Relative worker/chunk paths were inspected for same-origin subdirectory hosting. Embedding tests exercise the API with mocked rendering/models; they are not a real-browser integration test.

The existing preview was reloaded, but browser-control tooling then failed to inspect it. Native browser fallback was also unavailable. The revised minimal view, keyboard focus controls, actual host-site mounting, and real voice in that view have therefore not been visually/browser verified in this pass. Earlier model/voice measurements below apply to the original scaffold and are not new measurements of the embed revision.

## Production hosting check, 3 November 2026

Deployed the `sidekick` Cloudflare Worker at `https://build40for40.com/sidekick/`. The bare mount path redirects to the trailing-slash URL. Live HTTP checks confirmed the page's isolation and microphone headers, missing-asset 404s, and that the main domain still returns its existing page. The served JavaScript entry/chunks/workers and both decoded WASM runtimes matched the local build byte for byte. The larger WASM runtime is hosted compressed to fit the static asset upload limit.

The production page was opened in embedded Chromium on macOS. The temporary 3D controller, labels and Record control rendered. Clicking Record displayed the explicit local-model download explanation and download control. No models were downloaded and no microphone permission was requested in this check. Real voice on this production deployment remains unverified.

## Timing

The app emits `[Sidekick local timing, milliseconds; firstAudible is scheduling estimate]` in the development console for completed local spoken turns. It records transcription, generation, synthesis and the interval from recording completion to scheduling playback, including the audio context's reported base latency. It is not an acoustic first-audio measurement. Text questions have a transcription duration of zero and time from submission instead of recording completion. Repeat timing is from the Repeat gesture.

One real, warm-assets typed question (“Where is the right bumper?”) produced the following measurements in the embedded Chromium browser on macOS:

| Stage | Measured time |
| --- | ---: |
| Transcription | Not run (typed input) |
| Generation | 5384 ms |
| Synthesis | 2819 ms |
| Submission to scheduled playback, including reported audio latency | 8209 ms |

This is one observed turn, not a benchmark, percentile, target or acoustic measurement. Hardware/GPU identity and exact browser version were not captured. No microphone-to-audible timing baseline has been measured. Do not use automated fixture runtimes or upstream model metadata as voice performance claims.

## Remaining limitations

- Real microphone permission UI, captured speech transcription, real silence/noise and end-to-end microphone-to-audio latency need manual testing on target desktop Chrome hardware.
- Physical device presses/disconnection and unknown hardware mappings have logic tests but no connected-device verification. Live feedback now polls stick axes, button holds/releases and analog trigger values; physical exercises still require button press edges, including separate stick clicks.
- Blender assets are pending. GLB import has a validated node contract but no supplied asset test. Procedural local movements are implemented; artist animation clips and multi-node highlight targets are future integration work.
- Reduced-motion paths are implemented but need a full assistive-technology and OS preference check. Pointer hit areas and rear-view geometry should be checked again after asset integration.
- Model output is untrusted. JSON validation prevents arbitrary actions but does not guarantee accurate or appropriate natural language. Evaluate all cases on each model before shipping.
- No continuous listening, camera, account, persistence, inference backend, training, fine-tuning, full offline shell or mobile voice support.
- Model cache eviction, GPU loss, worker hangs and very low-memory devices need broader testing. ASR/TTS compute already in flight is allowed to finish in its worker; turn tokens suppress stale output, while WebLLM is interrupted explicitly.

## Knowledge integration revision — 3 November 2026

The integration adds runtime knowledge assets, verified-row filtering, game/prerequisite validation, bounded follow-up context, PS5 master IDs, narrated step sequencing and cancellable visual loops. No game is selected implicitly from `active-game.json`; a host selection or explicit game statement establishes context. Narration runs once and visual repetitions default to medium/unlimited. Speed/repetition settings and jargon rendering belong to the host API.

Automated checks cover both games' gold contracts, controller-only context, game switching, discarded cancelled history, invalid step/modifier rejection, filtering unverified prerequisites, visual loop limits/cancellation and step/audio ordering. Both pack dry runs pass (Overcooked 10/10, Fortnite 11/11). These are contract/fixture results, not local-model quality measurements. `evaluation/run.ts` provides a real-local-model comparison helper that rejects fixture mode.

A desktop in-app Chromium browser rendered the revised temporary PS5 controller and all 19 labels. This is a rendering smoke check only. The new pack prompt, constrained schema, multi-step narration, microphone path and answer quality have **not** been exercised with real models in this revision. The earlier Qwen/Kokoro observations above used the previous controller-only prompt. Current target is Chrome on a modern laptop. iPhone/Safari and Android/Chrome compatibility tests are deferred at the user's request.

Overcooked chop/throw and dash mappings remain disputed in the source pack; no physical verification was performed and no verification flags were upgraded. Artist GLB transforms, holding/double-press appearance, reduced motion and real audio synchronization still need manual checks with the final asset and models. The existing large runtime/WASM bundle warning remains.

## Performance revision

See [performance observations and limits](PERFORMANCE.md). The current automated suite includes direct PCM flush/cancellation cleanup, silence trimming, decimal-safe sentence splitting, synthesis prefetch without early visual cues, cancelled inference queue recovery, lazy audio worker replacement, stable grammar warmup and bounded-lifetime audio caching. These are mocked inference/media checks. A separate real-model comparison page is built at `performance.html`. The detailed implementation and measured browser limitations there supersede the original statement that cancelled ONNX work is allowed to finish.
## Live controller input revision — 3 November 2026

Live Gamepad API input is enabled by default, with a mount option and public method to disable it. The existing controller renders simultaneous button holds/releases, analog trigger travel and both sticks with a radial dead zone. Hardware feedback uses original local model transforms, takes priority over tutorial motion, retains highlights in reduced-motion mode and does not move the camera. Host code receives typed state/change events; no UI elements were added.

Automated checks exercise baseline/press-edge semantics, simultaneous controls, analog values, independent stick clicks, drift filtering, unsupported mappings, stable device selection, disconnect/reconnect, missing/blocked APIs, hidden-page suspension, disabling, cleanup, API snapshots and transform restoration. Scene tests use real Three.js objects with a mocked GPU renderer; they check simultaneous movement, tutorial priority, existing active labels, reduced motion and release. These checks do not verify actual Bluetooth transport or browser hardware mapping.

Manual check still required: pair the target controller with the MacBook, focus the page in desktop Chrome and press a controller button. Verify button holds/releases, simultaneous inputs, gradual trigger travel, both sticks and clicks, neutral drift, disconnect/reconnect, tab background/resume, and reduced motion. Repeat with USB to distinguish Bluetooth-specific problems. Safari, reserved system buttons, final GLB movement and cross-origin iframe policy behaviour remain unverified.

## Cards 143/144 — startup downloads and animation exit

The demo explicitly opts into full voice initialization on open. Other hosts default to Whisper-only prefetch and retain the consent step for the large models. Recognition initialization is reused by full setup. Automated checks cover automatic startup, background progress, no microphone/audio creation during setup, unsupported capability handling, single-click recording after setup, download failure and abort cleanup.

The contextual X and Escape stop narration and visual loops, clear highlights, and ease the camera back to front. Unlimited repeats remain the requested default; finite sequences return after the existing 3.5-second idle delay. Automated checks cover unlimited-loop cancellation, finite completion, focus restoration, Escape ownership across multiple instances, motion reset, stillness at rest, automatic settling and preservation of manual camera angles.

In the desktop embedded Chromium browser, opening the local demo started Whisper and then Qwen/Kokoro loading without a click, showed progress, and reached the ready Record state without requesting the microphone. The loaded controller rendered at rest. Selecting Square showed the X; both Escape and a subsequent X click cleared the demonstration, hid the X and returned the controller to front. This is a startup/UI smoke check, not an end-to-end spoken-gameplay or performance benchmark. Phone/browser compatibility testing remains deferred per the current laptop-Chrome scope.

After merging the newer voice-performance and opaque-controller-material changes, all 115 tests and the hosting build pass. Whisper prefetch now shares the same `AudioRuntime` and selected audio backend as full setup, preserving transferable PCM, busy-worker cancellation, model selection, grammar warmup and speech caching. The merged demo was reloaded in desktop Chromium: automatic startup again reached Record, and Escape again cleared an active Square demonstration. No microphone recording or phone compatibility test was performed.

## Optional remote generation, 3 November 2026

Remote generation adds automated transport, provider-adapter, request-control, model allowlist, validation and cancellation checks. Speech still runs on device. Real provider calls, provider/model-specific structured-output compatibility, and browser voice in remote mode remain unverified. The endpoint is disabled by default; no deployment or provider credentials were created. See [remote inference](REMOTE-INFERENCE.md).

Verification for this change: all 138 tests passed, strict TypeScript/declaration generation and the demo/ESM/worker production build passed, and Wrangler dry-run packaged the Worker successfully (about 429 KiB gzip). A local workerd smoke check served `/sidekick/` with HTTP 200 and rejected the unconfigured tutor endpoint with the expected JSON HTTP 503. No live provider call or remote-mode browser voice check was performed.

## Model and game settings, 3 November 2026

All 148 tests and the strict TypeScript/demo/ESM/worker/declaration build pass. Settings checks cover model and game selection, host/UI synchronization, consent after switching, stale setup disposal, preserving a new pending setup, game changes during setup, catalog discovery and server-side credential filtering. In embedded Chromium the gear, native model/game selectors, local model switching and game labels were exercised without downloading speech models or accessing the microphone. The panel also rendered within a 390px-wide, 480px-high component. Real remote-provider calls and voice after switching models remain unverified.

## Separate task summary, 3 November 2026

The pack-attribution line was removed from the embedded view. Short display instructions now appear above Record with the former note typography. Local/remote generation schemas and the prompt request a separate summary; runtime validation bounds it to 160 characters. Older replies use a deterministic control checklist. All 154 tests and the production demo/ESM/worker/declaration build pass. Tests verify display placement with captions off, summary validation, narration separation, and retention after synthesis failure. Embedded Chromium rendered a host-supplied summary above Record with a selected game and no attribution line. This browser check used fixture data without downloading models or playing audio; real model wording with the revised schema remains unverified.

## Anthropic Sonnet 5.5 enabled, 3 November 2026

All 155 tests and the full production build passed. Deployed Worker version `fe56637f-4542-4652-8f96-2f31b5346111` with only `anthropic:claude-sonnet-5-5` in the remote allowlist. The live model catalog returned that sole remote option. A real request through the production tutor route for “Where is L3?” returned HTTP 200, a separate on-screen summary, and a press step on `left-stick` with no game action. This first request took about 12.7 seconds (not a general latency benchmark). Browser microphone, local synthesis and voice after selecting this model have not been reverified. No provider key was read back or stored in the repository.
