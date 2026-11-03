# Cloudflare hosting

Production URL: https://build40for40.com/sidekick/ (the bare path redirects here).

The `sidekick` Worker serves the complete build using Workers Static Assets. Its two zone routes cover only `/sidekick` and `/sidekick/*`; the existing main website continues to handle other paths. The Worker removes the `/sidekick` prefix when fetching assets and restores it on canonical redirects. This account does not currently support non-root `assets.base_path`. The Vite build uses relative URLs so its ESM entry, chunks and model workers resolve under that path.

## Deploy

```sh
npm ci
npm test
npm run deploy
```

`npm run deploy` builds the demo, ESM entry, workers and declarations, prepares hosting assets, then runs the pinned Wrangler CLI with `--profile 40for40`. It removes inherited API key/token credentials for that command so they cannot override the profile. `wrangler.jsonc` pins the same account as the main website. An authenticated local `40for40` profile with access to that account and zone is required. Git pushes alone do not deploy; no deployment token is stored in this repository.

`dist/` remains the ordinary, uncompressed embedding distribution. The ignored `.cloudflare/assets/` staging directory holds the hosting copy. The preparation script gzips WASM runtimes because the asyncify runtime exceeds Cloudflare's 25 MiB individual static asset limit, and checks every uploaded file against that limit. The Worker serves compressed runtimes at their original `.wasm` URLs with `Content-Type: application/wasm` and `Content-Encoding: gzip`, passing through the compressed bytes without encoding them again.

The Worker adds COOP `same-origin`, COEP `credentialless`, and a microphone permissions policy for the same origin. Missing files remain 404s rather than returning the demo HTML. Model weights are still downloaded by the browser after consent; Cloudflare hosts application assets, not inference. These headers and a successful deployment do not certify real microphone or model behaviour on target hardware; see [VALIDATION.md](VALIDATION.md).
