# Small evaluation set

`cases.json` contains 12 starting cases for comparing Qwen, SmolLM2 and future fine-tunes. It is synthetic and contains no user recordings or personal data. `npm test` validates the deterministic fixture against the machine-checkable expectations. Those passing tests are not model quality results.

After enabling local voice, enter each prompt as text to isolate generation quality. Then speak it to evaluate ASR separately. Test each model in a fresh page/session on the same hardware, first with cold caches and then warm. Record model ID, weight revision, browser version, OS, GPU, cache state, validation failures, expected control/action and whether the explanation meets each case's criteria. Score brief language, one instruction, correct jargon definition, appropriate clarification and no unsupported physical claims. A validator pass does not prove semantic correctness.

For every voice turn, capture the console's numeric stage timings. Record transcription, generation, synthesis, and the recording-end-to-playback scheduling estimate. Repeat at least five times for median and range; do not label the scheduling estimate an acoustic first-audio measurement. Add an audio-loopback measurement if actual audible latency matters. Do not store personal microphone samples or conversation logs in this public repository.

Manually test permission denial, silent recording, interruption at every stage, rapid turns, failed downloads, cache eviction, WebGPU loss, unknown mappings, gamepad disconnection, reduced motion and shoulder/rear reveal. Count only real standard-mapped button edges as physical input. Use the results to choose a base model before collecting an opt-in dataset or considering fine-tuning. No model training is included or authorised by this scaffold.

## Knowledge integration

`cases.json` now includes the 21 game questions from both packs' CSVs with their gold replies, alongside the 12 controller cases (updated to PS5 IDs). Automated tests validate the gold contracts and comparison logic; they do not generate answers with an LLM. Run both pack checks after edits:

```sh
node knowledge/tools/dry-run.mjs
node knowledge/tools/dry-run.mjs fortnite
```

To compare actual local replies, start the dev server, explicitly initialize local voice after download consent, and from a host development harness call:

```ts
const { runEvaluation } = await import('/evaluation/run.ts');
const results = await runEvaluation(window.sidekick);
console.table(results.map(({ id, elapsedMs, failures, error }) => ({ id, elapsedMs, failures: failures.join(', '), error })));
```

The helper refuses development/fixture mode, explicitly selects each game's context, compares found/action IDs, exact input order and modifiers, and glossary terms, then restores controller-only mode. It stops speech and demonstrations between questions to isolate generation; this is not an end-to-end voice benchmark. Read the returned replies and score the prose against each case's criteria. A paraphrase can pass; structurally correct but unhelpful or unsupported prose still fails human review. No model results are checked into this repository by the helper.

Also test these conversations manually: ask about picking up a tomato with no game (it must ask which game), reply "Overcooked", ask "How do I chop it?", then ask "Where is L3?". Ask "How do I give something to someone else?" and check that it clarifies placing versus throwing. Check unsupported layouts, unverified actions, explicit game switches, interruptions, repeated sequences, held inputs and double presses. Current execution target is Chrome on a modern laptop; phone compatibility testing is deferred.
