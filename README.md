# Sidekick

A welcoming controller tutor scaffold built with vanilla TypeScript, Vite and Three.js. Ask a question, explore the controller and practise finding controls. Local voice adapters use Whisper, WebLLM and Kokoro in workers.

**This is an early scaffold, not a verified complete voice product.** It starts in clearly labelled development tutor mode with deterministic text replies. The 3D controller is a CC BY PS5 DualSense scan, split into one node per control (see [ASSETS.md](docs/ASSETS.md)). It can demonstrate Fortnite moves from Samira's knowledge pack (web-sourced, not yet checked on a console). Real local inference adapters are implemented; browser verification status is recorded in [VALIDATION.md](docs/VALIDATION.md).

## Run

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Use a current Node 22 LTS release (22.12 or newer) or Node 24 LTS. Local verification also used Node 26. Open the local Vite URL. No API keys or environment variables are needed. CI runs tests and production builds.

## Embedded unit

The default UI contains the controller and a Record button. First-use consent, loading and errors appear only when needed. Captions are opt-in. The host site supplies text input, lessons, navigation and any other surrounding UI through the public API.

```ts
import { createSidekick } from './src/index';

const tutor = createSidekick(document.querySelector<HTMLElement>('#tutor')!);
tutor.on(event => {
  if (event.type === 'reply') console.log(event.reply.spoken);
});
tutor.highlight('right-bumper');
// From host UI: tutor.ask('Where is the right bumper?');
// On unmount: tutor.destroy();
```

Build output includes an ESM entry at `dist/sidekick.js`, declarations and worker/model-runtime assets. The demo exposes `window.sidekick` for development. See [the embedding API and integration example](docs/EMBEDDING.md) for setup consent, recording, exercises, events, styling, cleanup and hosting requirements.

## Requirements

Initial target: desktop Chrome with WebGPU, a compatible GPU with sufficient free memory, WebAssembly, module workers, Web Audio and microphone access. Serve over HTTPS or localhost. Three.js currently renders with WebGL2; WebGPU is required by WebLLM. Other browsers/devices are not certified. The component scales to the host container; mobile voice is outside the initial scope.

Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` when hosting, as in `vite.config.ts`. Serve JS, WASM and model assets with appropriate content types, CORS and caching. There is no server or production deployment included.

The first download can be large and model initialization can take several minutes. Models are cached by the inference libraries where available. Cache eviction, browser updates and model changes can trigger downloads again. An unsupported device gets an explanation; the host can continue through the text-question API in development mode. There is no silent remote speech fallback.

## Architecture

| Area | Location | Responsibility |
| --- | --- | --- |
| Embedding API | `src/index.ts`, `src/embed.ts` | Isolated component, typed public functions, events and lifecycle |
| Controller facts | `src/controller/manifest.ts`, `knowledge/` | Stable IDs, names, labels, glyphs, aliases, descriptions, targets, views, movement, gamepad mappings, game moves |
| Rendering | `src/controller/scene.ts` | Showcase stage, GLB loading, raycast selection, spotlight and glow, labels, local motion, move playback and camera |
| Lessons | `src/tutor/lesson.ts` | Explicit exercise state, hint state and input-confirmed completion |
| Tutor boundary | `src/tutor/schema.ts` | Allowlisted JSON schema and independent runtime validation |
| Development tutor | `src/tutor/development.ts` | Labelled deterministic fixture for scaffold testing |
| Voice | `src/voice/` | Typed adapters, state machine, turn tokens, recording, sequential stage queue, playback and timings |
| Workers | `src/workers/` | ASR, generation and synthesis, away from the main UI thread |
| Evaluation | `evaluation/cases.json` | Small model-independent set, including ambiguity and unsupported claims |

Generation uses manifest facts and the current question only, bounding conversation context. Exercises remain in application state. Constrained JSON is validated before execution or synthesis. Invalid output is rejected, never spoken. Recognition, generation and synthesis are sequenced to avoid overlapping inference for turns; weights remain resident after loading. Old ONNX computations finish in their worker but their results are ignored. WebLLM generation is also interrupted. No arbitrary code, tool URLs or model-generated commands are executed.

## Next work

See [asset integration](docs/ASSETS.md), [model IDs, licences and fine-tune registration](docs/MODELS.md), [validation and performance](docs/VALIDATION.md), and [evaluation procedure](evaluation/README.md). Bring in the controller asset, verify every local model on target Chrome hardware, then compare models before considering training.
