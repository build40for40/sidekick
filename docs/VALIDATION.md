# Verification record

Initial scaffold, 3 November 2026. This record separates automated fixture checks, real browser checks, and unverified hardware behaviour.

## Automated

- 28 tests pass: response validation, unsupported control/action rejection, lesson transitions, virtual versus physical completion, hint removal, unknown gamepad mappings, phase transitions, cancellation during generation and synthesis, stale worker messages, microphone-denial recovery, late microphone permission cleanup, download failure cleanup, unsupported WebGPU, and 12 deterministic evaluation cases.
- TypeScript strict checking and Vite production build pass.
- npm audit reports zero known vulnerabilities with the lockfile and Sharp override.
- Production bundles include lazy model runtimes and large WASM files. Vite emits a large-chunk warning. Model runtime size and memory remain optimisation work.

Tests with fake media and adapters verify failure/cancellation logic only. They do not prove live speech recognition or model accuracy.

## Browser checks

The production build was opened in the available embedded Chromium browser on macOS. Verified temporary 3D rendering and labels, text fixture questions for right bumper and stick clicking, the virtual stick exercise, and the explicit local model setup flow. All three real models loaded and the Kokoro warmup completed. Reloading and enabling voice again also completed with cached model assets. This does not certify offline use.

The first real Qwen generation selected a non-none action without a control ID; the application rejected it without executing it or speaking it. The generation schema was tightened so non-none actions require a control ID, alongside an explicit example in the system prompt. After that change, the real Qwen response to “Where is the right bumper?” passed validation, revealed the shoulder view, and completed real Kokoro synthesis and Web Audio playback. The browser returned to ready and emitted a timing event. The second real prompt, “What does clicking the stick mean?”, also completed with a brief straight-down-press explanation and local speech. These were typed questions, not microphone recordings. The 390px layout had a 390px scroll width with no horizontal overflow.

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
- Physical device presses/disconnection and unknown hardware mappings have logic tests but no connected-device verification. Stick axes are present in the manifest but are not polled yet; physical exercises use button presses including stick clicks.
- Blender assets are pending. GLB import has a validated node contract but no supplied asset test. Procedural local movements are implemented; artist animation clips and multi-node highlight targets are future integration work.
- Reduced-motion paths are implemented but need a full assistive-technology and OS preference check. Pointer hit areas and rear-view geometry should be checked again after asset integration.
- Model output is untrusted. JSON validation prevents arbitrary actions but does not guarantee accurate or appropriate natural language. Evaluate all cases on each model before shipping.
- No continuous listening, camera, account, persistence, backend, training, fine-tuning, deployment, full offline shell or mobile voice support.
- Model cache eviction, GPU loss, worker hangs and very low-memory devices need broader testing. ASR/TTS compute already in flight is allowed to finish in its worker; turn tokens suppress stale output, while WebLLM is interrupted explicitly.
