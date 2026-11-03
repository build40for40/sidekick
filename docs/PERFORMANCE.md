# Voice performance

This revision improves runtime scheduling and audio acceleration. It does not certify model answer quality or promise a particular end-to-end latency.

## Changes

- WebGPU ASR and Kokoro with explicit local WASM fallback and a host-selectable WASM baseline. Selected models, backend and precision are reported in timing events.
- Tutor and ASR kernel/grammar warmup during consented setup. One stable constrained JSON grammar is reused across game changes; identifier enums prevent unknown control IDs, while runtime validation continues to enforce selected-game actions and prerequisites.
- Short spoken introductions. Instructions remain in steps. The full coaching policy remains; a shorter policy did not establish sufficient semantic quality in browser checks.
- Direct mono PCM via AudioWorklet; local MediaRecorder compatibility path; one 16 kHz resampling pass and conservative edge-silence trimming. Internal pauses remain. PCM is transferred across workers rather than cloned.
- Validated introductions are split into sentences. The next sentence or complete action instruction synthesizes during current playback; cues fire only when the corresponding instruction starts. No partial tutor JSON is spoken.
- 8 MiB runtime-local audio cache, discarded on destroy. Benchmark synthesis bypasses it.
- Cancelled turn promises no longer block the orchestration queue. Busy audio workers terminate and reload lazily on the next request; idle models remain loaded. Worker reload can itself cost time. Tutor generations stay serialized behind WebLLM interruption, avoiding overlapping calls to one engine.
- Host options select Qwen 1.5B (default), Qwen 0.5B, or SmolLM2 360M. The smaller candidates are experiments, not validated quality replacements.
- Expanded timings and a separate `performance.html` comparison lab, shipped alongside demo, ESM, workers and types.

## Browser observations, 3 November 2026

Real model checks used desktop Chrome 156 on macOS, cross-origin isolation enabled, 15 reported logical processors. Early checks did not capture useful GPU identity. Synthetic speech was generated locally with Kokoro: “Where is the right bumper?”, then resampled to mono 16 kHz for Whisper. It is labelled synthetic and is not a microphone or acoustic latency measurement.

Early single GPU audio observations ranged from 224–665 ms ASR and 258–435 ms synthesis for this short phrase. These were separate smoke runs with different warmup states, not comparable percentiles. A later five-pass comparison is recorded below where available.

Qwen 0.5B initially failed all five smoke requests with invalid/unavailable identifiers. With stronger identifier constraints it produced a structurally valid but wrong “right bumper is the right thumbstick” answer, failed required game-action inputs/prerequisites, and invented inputs for an unsupported action. It is therefore not the default.

Timing telemetry exposed 8394 ms of grammar initialization on an early first controller request and approximately 27–28 seconds elapsed on first requests after changing a game-dependent grammar. This led to the stable grammar and setup warmup. In the next Qwen 1.5B check, per-request grammar initialization reported approximately 0.01–0.10 ms even across game switches. Total validated response generation for the first three cases was 3878, 2669 and 4367 ms; first-sentence synthesis was 515, 562 and 587 ms. These used an interim shorter prompt. They do not establish latency for the final fuller prompt.

The 1.5B smoke check also exposed semantic problems: bumper/trigger wording, a missing prerequisite (rejected), and an unsupported driving answer with actionId null. Structural validation cannot establish factual correctness. Keeping the larger model does not certify its answers. Prompt compression was dropped and the original detailed policy retained with one brief introduction instruction.

## Remaining verification

Run the lab on the target device, comparing identical models/prompts/questions and warmup state. Audio-only runs perform five uncached synthesis/ASR passes. The full suite repeats controller and both game-pack cases five times, saves actual replies/errors and token metrics, and requires human semantic review. Do not call five passes a robust p95 estimate.

Actual microphone capture, quiet consonants, worklet playback/recording interactions, acoustically measured first audio, low-memory GPU behavior, fallback performance on other hardware and the full real-model evaluation matrix remain manual checks. Automated media mocks prove orchestration contracts, not live microphone behavior. Continuous/chunked ASR during recording is not enabled: naive repeated Whisper decoding duplicates computation and risks losing cross-chunk context. Direct PCM capture leaves a path for a future measured streaming recognizer without changing the public API. No inference leaves the device.

## Five-pass audio comparison

Same session and phrase on the Apple Metal-3 GPU reported by Chrome 156, with the Qwen 1.5B tutor resident. Models were initialized before timing; response caching was disabled. All ten recognition outputs matched the phrase (ignoring leading whitespace).

| Stage | WASM q8 median (range) | GPU median (range) | Median ratio |
| --- | ---: | ---: | ---: |
| ASR | 1224 ms (1098–1291) | 355 ms (320–444) | 3.4× |
| Synthesis | 4692 ms (4343–4897) | 278 ms (255–411) | 16.8× |

GPU ASR used encoder fp32 / decoder q4; GPU synthesis used fp32. These compare complete configurations, not only execution backends. Raw rounded samples and environment metadata are in [the synthetic audio record](../evaluation/performance/2026-11-03-audio.json). Tests were serial, not randomized, and browser caching/other activity can affect results. This is one phrase on one machine, not an end-to-end microphone latency benchmark.

SmolLM2 360M was also smoke-tested with the fuller retained prompt. Its five responses took 1194–2357 ms, with negligible grammar initialization after setup. All five failed manual semantic review: the bumper answer pointed to the left stick; other answers were unhelpful one-word replies or invented left-stick instructions. Structurally valid JSON did not make these usable. It remains an explicit experimental profile.

The final default-profile production-build smoke check initialized all three real models successfully with the fuller policy. Four structurally valid responses took 4645, 4901, 5836 and 6602 ms; the unsupported-driving case was rejected for an invalid tilt direction after 16534 ms. Grammar initialization was 0.015–0.260 ms after setup. Semantic review still found bumper/trigger wording and incorrect/omitted game instructions; only the stick-click explanation was clearly satisfactory. Generation remains the dominant warm-turn bottleneck. This check is not a model quality pass or evidence that every tutor response became faster. The audio improvement, first-turn grammar shift and interruption recovery are the verified gains; broader grounding and answer quality remain separate work.
