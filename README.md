# Sidekick

A welcoming, private game guide powered by a local LLM, built with vanilla TypeScript, Vite and Three.js. The intended experience is to ask questions such as “How do I jump in this game?” or “How do I do this action?” and receive guidance through game actions, sequences of actions and components of the game. The interactive 3D controller supports that guidance by showing the relevant inputs and how to use them. Local voice adapters use Whisper, WebLLM and Kokoro in workers.

The tutor starts with PS5 controller explanations and no selected game. Local mode can load verified Overcooked! 2 or Fortnite knowledge, answer follow-up questions, and narrate multi-step demonstrations on the 3D controller. A game must be named in the question or selected by the host. Broader gameplay knowledge beyond the supplied pack is unavailable. Game moves are from Samira's pack (web-sourced, not yet checked on a console).

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

Live controller feedback is enabled by default. Pair a controller with macOS over Bluetooth (or connect by USB), focus the page, then press a controller button. Standard-mapped inputs drive simultaneous button holds, trigger travel and stick movement on the existing PS5 model. No voice setup is needed. See [live controller feedback](docs/EMBEDDING.md#live-controller-feedback) for the host API, mapping limitations and physical-device verification status.

## Embedded unit

The default UI contains the controller and a Record button. First-use consent, loading and errors appear only when needed. Captions are opt-in. The host site supplies text input, lessons, navigation and any other surrounding UI through the public API.

```ts
import { createSidekick } from './src/index';

const tutor = createSidekick(document.querySelector<HTMLElement>('#tutor')!);
tutor.on(event => {
  if (event.type === 'reply') console.log(event.reply.spoken);
});
tutor.highlight('r1');
// tutor.setGame('overcooked2'); // explicit game context; null restores controller-only mode
// tutor.setPlayback({ speed: 'medium', maxRepeats: null }); // unlimited visual passes
// From host UI: tutor.ask('Where is the right bumper?');
// On unmount: tutor.destroy();
```

Build output includes an ESM entry at `dist/sidekick.js`, declarations and worker/model-runtime assets. The demo exposes `window.sidekick` for development. See [the embedding API and integration example](docs/EMBEDDING.md) for setup consent, recording, exercises, events, styling, cleanup and hosting requirements.

## Requirements

Current test target: Chrome on a modern laptop with WebGPU, a compatible GPU with sufficient free memory, WebAssembly, module workers, Web Audio and microphone access. Serve over HTTPS or localhost. Three.js renders with WebGL2; WebGPU is required by WebLLM. Phone compatibility testing (iPhone/Safari and Android/Chrome) is deferred. Other browsers/devices are not certified.

Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` when hosting, as in `vite.config.ts`. Serve JS, WASM and model assets with appropriate content types, CORS and caching. Production hosting is configured for Cloudflare at [build40for40.com/sidekick](https://build40for40.com/sidekick/). See [hosting setup and deployment](docs/HOSTING.md).

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

Generation uses controller facts, the explicitly selected game's filtered pack, the latest successful exchange and the current question. Game changes clear the exchange. Exercises remain in application state. Constrained JSON and verified game inputs/prerequisites are validated before execution or synthesis. Invalid output is rejected, never spoken. Recognition, generation and synthesis are sequenced; weights remain resident after loading. Old ONNX computations finish in their worker but their results are ignored. WebLLM generation is also interrupted. No arbitrary code, tool URLs or model-generated commands are executed. Valid JSON and correct control IDs do not prove the model's prose is accurate.

The introduction and each step are spoken once; the matching control animates during that step. Visual sequences then repeat silently at medium speed without a limit. Hosts can set speed and total passes through the API; no settings UI is included. New questions, recording, stop, game changes, page backgrounding and destruction cancel demonstrations. Jargon is available in reply events and state for the host to display.

## Next work

See [asset integration](docs/ASSETS.md), [model IDs, licences and fine-tune registration](docs/MODELS.md), [validation and performance](docs/VALIDATION.md), and [evaluation procedure](evaluation/README.md). Bring in the controller asset, verify every local model on target Chrome hardware, then compare models before considering training.
