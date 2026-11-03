# Sidekick

Vanilla TypeScript, Vite, Three.js. No UI framework. This is an early scaffold for a private, on-device controller tutor.

- Run `npm ci`, `npm test`, `npm run build`.
- Keep rendering, controller facts, lesson state and inference adapters separate.
- Inference stays on device. Never add hosted inference or browser speech recognition as an implicit fallback.
- Fixture mode must be labelled. Never claim a virtual click proves a physical press.
- Validate tutor JSON before executing an action or speaking it.
- Preserve model node transforms and use semantic IDs from the manifest.
- Document unverified browser/model behaviour honestly.
- Do not commit model weights, Blender backups, credentials or personal data.

- Keep the embedded view minimal: controller and recording button, with contextual consent/status only. Host features belong in the typed public API.
- Preserve Shadow DOM style isolation and release resources in `destroy()`. Build the demo, ESM entry, worker assets and type declarations together.
