# Knowledge pack: Day 2

What the LLM is given so it can turn "how do I build a wall?" into a button sequence the animation can play. Nothing is trained: Ben's code loads these files into the model's context with every question.

**Who owns what:** Samira writes the facts and the rules. Ben loads them, enforces the schema and runs the tests.

**Button labels: Samira is the master labeller.** The control ids in `controllers/ps5.json` are the single source of truth. Ben's `src/controller/manifest.ts` and the node names in Lawrence's 3D model must use these exact ids. If a name needs to change, change it here first (Samira), then everywhere else.

| File | What it is | Owner | Status |
|---|---|---|---|
| `controllers/ps5.json` | Every PS5 control: id, name, nicknames, where it is, how it moves | Samira | **Master list of button labels** |
| `games/fortnite.json` | Each Zero Build (and build) action and its steps | Samira | Usable: from a published guide (`verified: "web"`), check on a real PS5 |
| `glossary.json` | Gamer slang → plain English | Samira | Usable: approved for the demo, check with a real player |
| `system-prompt.md` | How the LLM behaves | Samira | Done |
| `output-schema.json` | The multi-step answer format (extends `TutorReply`) | Samira + Ben | Decided: multi-step. Ben to extend `validateReply` |
| `test-questions.csv` | 10 questions and the right answers | Samira | Done: merge into `evaluation/cases.json` |

## How Ben uses it (in `sidekick`)

1. System prompt = `system-prompt.md`, followed by the three data files (only rows with `verified` set to `"device"`, `"web"` or `"approved"`).
2. User message = the person's question.
3. Force the reply into `output-schema.json` with WebLLM: `response_format: { type: "json_object", schema: JSON.stringify(schema) }`.
4. `src/tutor/schema.ts`: extend `validateReply` to loop over `steps`, running the existing per-control checks on each one (known `controlId`, `tilt` only on sticks, `squeeze` only on triggers).
5. `src/controller/manifest.ts`: swap the placeholder Xbox controls for the PS5 ids in `controllers/ps5.json` (adds `touchpad`, `create`, `ps`, `mute`), matching the node names in Lawrence's model.
6. The animation plays `steps` in order; the voice reads `spoken`, then each `say`.
7. Add `test-questions.csv` to `evaluation/cases.json` and run it after every change.

## Before the demo

- [x] Fortnite PS5 defaults (Builder Pro) filled in from a published guide: rows are `verified: "web"`
- [ ] Check them on a real PS5 controls screen, then change `"web"` to `"device"`
- [x] Glossary approved by Samira for the demo (`verified: "approved"`)
- [ ] Check the glossary with a real Fortnite player
- [ ] Rename button ids to match the Blender model (or the other way round)
