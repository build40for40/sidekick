# Sidekick

Vanilla TypeScript, Vite, Three.js. No UI framework. This is an early scaffold for a private, on-device game guide powered by a local LLM.

The intended experience is to answer basic game-specific questions such as “How do I jump in this game?” and guide users through actions, sequences of actions and components of a game. The visual controller is a supporting aid for illustrating the relevant inputs; controller familiarity is one part of the experience, not the full product scope. The current scaffold focuses on controller facts and practice; game-specific knowledge and guidance remain to be implemented.

- Run `npm ci`, `npm test`, `npm run build`.
- Keep rendering, controller facts, lesson state and inference adapters separate.
- Distinguish general controller facts from game-specific action mappings and instructions. Do not assume an input performs the same action in every game or claim game knowledge the application has not supplied.
- Local inference is the default. Remote LLM generation is allowed only through explicit host configuration and disclosed consent; keep provider credentials on the server. Never add hosted inference or browser speech recognition as an implicit fallback.
- Fixture mode must be labelled. Never claim a virtual click proves a physical press.
- Validate tutor JSON before executing an action or speaking it.
- Preserve model node transforms and use semantic IDs from the manifest.
- Document unverified browser/model behaviour honestly.
- Do not commit model weights, Blender backups, credentials or personal data.

- Keep the embedded view minimal: controller, recording button and a compact settings menu for model/game selection, with short task instructions and contextual consent/status. Expose the same settings through the typed public API.
- Preserve Shadow DOM style isolation and release resources in `destroy()`. Build the demo, ESM entry, worker assets and type declarations together.
