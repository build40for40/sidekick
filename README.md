# Sidekick

A welcoming controller tutor scaffold built with vanilla TypeScript, Vite and Three.js. Ask a question, explore the controller and practise finding controls. Local voice adapters use Whisper, WebLLM and Kokoro in workers.

**This is an early scaffold, not a verified complete voice product.** It starts in clearly labelled development tutor mode with deterministic text replies. The temporary 3D controller will be replaced by Blender assets later. Real local inference adapters are implemented; browser verification status is recorded in [VALIDATION.md](docs/VALIDATION.md).

## Run

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Use a current Node 22 LTS release (22.12 or newer) or Node 24 LTS. Local verification also used Node 26. Open the local Vite URL. No API keys or environment variables are needed. CI runs tests and production builds.

## Try it

- Ask “Where is the right bumper?” or “What does clicking the stick mean?” with the text box or suggestion buttons. The development tutor is deliberately small and deterministic.
- Click controls or drag to orbit. Front, shoulders and back views reveal hard-to-see controls. Open **Explore all controls** for keyboard selection.
- Try **Find a control**, **Click a stick** or **Try it yourself**. Turn off hints to remove the selected outline. A virtual selection is labelled virtual recognition, never a confirmed physical press.
- Click **Enable local voice** to explicitly download the models, with progress and retry on error. After loading, click Talk once to start recording and again to finish. Recording is capped at 30 seconds. First microphone permission follows this user gesture.
- Starting a new recording or text question interrupts playback and invalidates the preceding turn. Stop cancels a turn; Repeat synthesizes the last valid reply. Captions are optional. No speech autoplays on page load.
- Optionally enable physical input. Standard Gamepad API mappings use edge-detected button presses. Unknown mappings fail closed. A reconnect establishes a new baseline; a held button is not counted as a new press. The controller may need a button press before Chrome exposes it.

## Requirements

Initial target: desktop Chrome with WebGPU, a compatible GPU with sufficient free memory, WebAssembly, module workers, Web Audio and microphone access. Serve over HTTPS or localhost. Three.js currently renders with WebGL2; WebGPU is required by WebLLM. Other browsers/devices are not certified. The page remains responsive at 390px for text exploration, but mobile voice is outside the initial scope.

Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` when hosting, as in `vite.config.ts`. Serve JS, WASM and model assets with appropriate content types, CORS and caching. There is no server or production deployment included.

The first download can be large and model initialization can take several minutes. Models are cached by the inference libraries where available. Cache eviction, browser updates and model changes can trigger downloads again. An unsupported device gets an explanation and can continue in text development mode. There is no silent remote speech fallback.

## Architecture

| Area | Location | Responsibility |
| --- | --- | --- |
| Controller facts | `src/controller/manifest.ts` | Stable IDs, names, labels, aliases, descriptions, targets, views, movement, gamepad mappings |
| Rendering | `src/controller/scene.ts` | Temporary controller, GLB loading, raycast selection, outlines, labels, local motion and camera |
| Lessons | `src/tutor/lesson.ts` | Explicit exercise state, hint state and input-confirmed completion |
| Tutor boundary | `src/tutor/schema.ts` | Allowlisted JSON schema and independent runtime validation |
| Development tutor | `src/tutor/development.ts` | Labelled deterministic fixture for scaffold testing |
| Voice | `src/voice/` | Typed adapters, state machine, turn tokens, recording, sequential stage queue, playback and timings |
| Workers | `src/workers/` | ASR, generation and synthesis, away from the main UI thread |
| Evaluation | `evaluation/cases.json` | Small model-independent set, including ambiguity and unsupported claims |

Generation uses manifest facts and the current question only, bounding conversation context. Exercises remain in application state. Constrained JSON is validated before execution or synthesis. Invalid output is rejected, never spoken. Recognition, generation and synthesis are sequenced to avoid overlapping inference for turns; weights remain resident after loading. Old ONNX computations finish in their worker but their results are ignored. WebLLM generation is also interrupted. No arbitrary code, tool URLs or model-generated commands are executed.

## Next work

See [asset integration](docs/ASSETS.md), [model IDs, licences and fine-tune registration](docs/MODELS.md), [validation and performance](docs/VALIDATION.md), and [evaluation procedure](evaluation/README.md). Bring in the controller asset, verify every local model on target Chrome hardware, then compare models before considering training.
