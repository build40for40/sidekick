# Local model adapters

All evaluation happens inside browser workers. No hosted inference endpoint, browser SpeechRecognition or browser speechSynthesis fallback is used. Only app assets, runtime WASM, model weights, tokenizers, voices and model libraries may be downloaded. Audio and transcripts are held in memory, not sent to a backend. The app has no analytics or server API. Providers still receive ordinary asset request metadata. Cache storage can be evicted by the browser; offline support is not guaranteed.

## Pinned dependencies and defaults

The lockfile pins transitive versions. Top-level package versions are exact.

| Component | Package | Model / runtime | Licence and source |
| --- | --- | --- | --- |
| Recognition | `@huggingface/transformers` 4.3.2 | `onnx-community/whisper-tiny.en`, WebGPU encoder fp32 / decoder q4; local WASM q8 fallback, mono 16 kHz | [OpenAI model card](https://huggingface.co/openai/whisper-tiny.en), Apache-2.0 model card; [ONNX export](https://huggingface.co/onnx-community/whisper-tiny.en); Transformers.js Apache-2.0 |
| Tutor | `@mlc-ai/web-llm` 0.2.87 | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`, WebGPU | [Qwen model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct), Apache-2.0; WebLLM Apache-2.0 |
| Voice | `kokoro-js` 1.2.1 | `onnx-community/Kokoro-82M-v1.0-ONNX`, WebGPU fp32; local WASM q8 fallback, `af_heart` | [Kokoro ONNX model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), Apache-2.0; Kokoro.js Apache-2.0 |
| Alternative tutor | Same WebLLM | `SmolLM2-1.7B-Instruct-q4f16_1-MLC` | [SmolLM2 model card](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct), Apache-2.0 |
| Rendering | `three` 0.187.0 | Procedural temporary controller | Three.js MIT; generated geometry belongs to this project |

Whisper's original repository also includes its MIT licence; retain the respective notices when redistributing weights. Model weights are not included in this repository. Upstream model revisions are currently the providers' defaults, not immutable commits; pin hosted revisions before a reproducible production release. Kokoro.js includes Transformers.js 3.x internally in addition to the direct 4.x dependency. Both are built into separate lazy worker chunks. `sharp` is overridden to 0.35.5 to remove transitive audit findings; browser audio paths do not use Sharp.

Qwen's exact default ID and the SmolLM2 alternative were confirmed against the installed `prebuiltAppConfig.model_list`. That config estimates Qwen's VRAM at 1629.75 MB; this is upstream metadata, not a device measurement or a guarantee. Allow additional memory for rendering and both audio models.

The embedded interface uses system fonts and makes no external font requests.

## API references used

- [Transformers.js pipeline docs](https://huggingface.co/docs/transformers.js/api/pipelines): `pipeline('automatic-speech-recognition', id, options)`, progress callback, Float32Array audio.
- [WebLLM worker setup](https://webllm.mlc.ai/docs/user/advanced_usage.html): `CreateWebWorkerMLCEngine`, `WebWorkerMLCEngineHandler`.
- [WebLLM API](https://webllm.mlc.ai/docs/user/api_reference.html): `chat.completions.create`, `response_format: {type: 'json_object', schema: JSON.stringify(schema)}`, `interruptGenerate`.
- [Kokoro.js official README](https://github.com/hexgrad/kokoro/tree/main/kokoro.js): `KokoroTTS.from_pretrained`, `generate`, `RawAudio.audio` and `sampling_rate`. The setup synthesizes a short warmup in the worker to cache the selected voice; it does not play it.

## Switching models and registering a future fine-tune

Use the host performance options or comparison lab to compare the registered models below. To try another compiled model, change an entry in `tutorModels` in `src/voice/config.ts` to its exact registered ID. No training is part of this scaffold. Keep the prompt, manifest, runtime validator and evaluation set constant when comparing models.

For a future fine-tuned model, convert and quantize its weights to MLC format with a compatible MLC toolchain. A GGUF or raw Hugging Face Transformers checkpoint alone is insufficient. Host its `mlc-chat-config.json`, tokenizers, weight shards and compatible WebGPU model library with CORS enabled. Ensure the chat template matches the base model.

In `loadLocal`, import `prebuiltAppConfig` and pass an `appConfig` into `CreateWebWorkerMLCEngine` containing the existing config plus a new `model_list` record with `model` (asset base URL), `model_id` (unique application ID) and `model_lib` (compatible WASM library URL). Set a `tutorModels` entry to that ID. Use a WebLLM 0.2.87-compatible compiled library, not an arbitrary latest build. Validate licence and distribution rights, rerun structured-output and cancellation tests, then run every evaluation case on the actual browser. Do not let model output override application data, action validation or physical input checks.

## Performance revision

The tutor default remains Qwen2.5 1.5B: the 0.5B candidate was faster but failed semantic and verified-action smoke checks. The host may explicitly choose `performance.tutor: 'fast'` for `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, or `'compact'` for `SmolLM2-360M-Instruct-q4f16_1-MLC`. Both IDs were verified in the installed 0.2.87 registry; neither is certified as equivalent in quality. `'quality'` selects the existing 1.5B model.

Audio now defaults to trying WebGPU: Whisper uses encoder fp32 / decoder q4, and Kokoro uses fp32 as recommended upstream. Initialization/warmup failure reports a local WASM q8 fallback. `performance.audioBackend: 'wasm'` forces the original audio backend for comparison. GPU audio increases memory requirements and is not guaranteed faster on every device. Whisper and Kokoro GPU warmups happen during setup. One stable, metadata-free JSON grammar is warmed with an internal one-token tutor completion, never executed or spoken. The enum lists known identifiers across installed packs to avoid recompiling on game switches; the prompt still contains only the selected game, and runtime validation enforces that game and its prerequisites. The richer prompt rules are retained because prompt compression did not establish acceptable real-model quality.

See [performance implementation and browser observations](PERFORMANCE.md) and [host options](EMBEDDING.md#local-performance-profiles).
