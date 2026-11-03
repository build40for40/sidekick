# Remote tutor generation

Local inference remains the default. An explicitly configured remote tutor replaces only WebLLM generation. Whisper recognition and Kokoro synthesis still run on device, using WebGPU where available or local WASM. Remote mode does not download Qwen or require WebGPU for generation. HTTPS/localhost, microphone access, workers and local speech-model downloads are still needed for voice.

## Host API

```ts
const tutor = createSidekick(container, {
  inference: {
    mode: 'remote',
    endpoint: '/sidekick/api/tutor',
    model: 'anthropic:YOUR_MODEL_ID',
  },
});
// After disclosing downloads and transmission and receiving consent:
await tutor.initializeVoice({ consent: true });
tutor.ask('Where is the right bumper?');
```

The endpoint must be on the host page's origin. It uses same-origin cookies, so hosts can put it behind their existing authentication. Provider keys never belong in browser configuration or any `VITE_` variable. Switch models in the gear menu or with `setModel()`. The old runtime is released and Record requires fresh setup consent. Local performance options still configure audio, but `performance.tutor` has no effect on remote generation.

Remote setup and ready status identify the configured model and explain transmission. Transcripts, controller facts, the selected game's filtered knowledge and the latest successful exchange are sent through your backend to the provider. Raw microphone audio remains on device. Provider retention is subject to that provider's policy; the OpenAI adapter explicitly requests `store: false`. No transcripts or provider responses are logged by our handler. There is no automatic switch between local, remote or fixture generation after an error. Remote `ask()` requires completed setup with consent; a setup error leaves the labelled development state available for controller exploration.

The existing `autoInitializeVoice: true` is a host assertion that the host already obtained consent for setup, including remote transmission when configured. The first-party remote demo keeps this false. Whisper-only prefetch remains available before setup and sends no transcript.

## Configure the Cloudflare backend

The demo discovers remote choices from `GET /sidekick/api/models` when Settings opens. Only allowlisted models with configured providers and a request limiter are offered; no credentials are returned. Other hosts can provide a `remoteModels` list or a same-origin `modelCatalog` URL. See [the embedding settings API](EMBEDDING.md#settings-menu).

The existing Worker handles `POST /sidekick/api/tutor`. Remote inference is disabled until `TUTOR_MODELS` contains an explicit comma-separated allowlist and the corresponding server credentials are supplied. The checked-in allowlist now contains only `anthropic:claude-sonnet-5-5` ([official model ID](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)). Change it in `wrangler.jsonc` (or Cloudflare configuration). Supply provider credentials with Wrangler secrets. For local development use ignored `.dev.vars`; see `.dev.vars.example`.

| Model prefix | Server configuration |
| --- | --- |
| `openai:MODEL` | `OPENAI_API_KEY` |
| `anthropic:MODEL` | `ANTHROPIC_API_KEY` |
| `google:MODEL` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `gateway:PROVIDER/MODEL` | `AI_GATEWAY_API_KEY` (optional Vercel AI Gateway) |
| `compatible:MODEL` | `COMPATIBLE_BASE_URL`, optional `COMPATIBLE_API_KEY` |

Use actual model IDs available to your provider account. Any gateway-supported model can be selected through `gateway:`. Other AI SDK providers can be added to `resolveLanguageModel()` in `hosting/tutor.ts` by installing their SDK adapter and registering it. OpenAI-compatible endpoints use JSON mode by default; providers must support JSON generation. Structured-output support and model accuracy vary. Unsupported models fail explicitly and do not fall back.

The handler uses AI SDK `generateText` with `Output.object`, a fixed tutor schema, no tools, no automatic retries, a 1,200-token output ceiling and a 40-second deadline. Client requests time out at 45 seconds. Stop, game changes and destruction abort the client request and ignore late results. The SDK also receives the Worker request abort signal; provider cancellation on client disconnection depends on the hosting runtime and may not prevent billing for an already-started request. The server validates the completed response; the browser additionally applies the selected game's input, prerequisite and glossary checks before narration or animation. Streaming partial output is never executed or spoken.

The checked-in rate-limit binding allows 10 requests per minute per client IP. The handler refuses inference without it, requires same-origin JSON POSTs, limits bodies to 64 KiB and accepts only the tutor's bounded message sequence. Cloudflare rate limits are per location and are not a global spending cap. Use provider spend limits and host authentication for a private installation. Same-origin checking prevents cross-site browser requests; it is not authentication. No deployment or secrets provisioning happens as part of a build.

## Run the remote demo locally

1. Copy `.dev.vars.example` to `.dev.vars` and supply the allowlist and the chosen provider's key.
2. Build the demo with the same allowed model:

   ```sh
   VITE_TUTOR_MODEL='anthropic:YOUR_MODEL_ID' npm run build:hosting
   npx wrangler dev --port 8787
   ```

3. Open `http://localhost:8787/sidekick/`. Click Record to read and accept remote setup, then wait for local speech downloads. The Vite-only dev server does not run the backend route.

For production, set `TUTOR_MODELS` in the Worker configuration, add the provider secret (for example `npm run secret:put -- ANTHROPIC_API_KEY`), and build/deploy with the desired public `VITE_TUTOR_MODEL`. A build without that variable continues to use the local demo. A host importing the ESM entry selects its own inference options independently.

Automated tests exercise mocked provider HTTP responses, validation, cancellation, timeout and request controls. Real remote-provider calls and remote-mode browser voice have not been verified; no credentials or model weights are included.

Sonnet 5.5 uses `thinking: { type: "between_tools" }` and low effort for short tutor responses, with native structured output and no sampling parameters. The local model remains the initial selection; choose Sonnet in Settings to opt into remote generation.
