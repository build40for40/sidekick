# Knowledge pack: Day 2

What the LLM is given so it can turn "how do I build a wall?" into a button sequence the animation can play. Nothing is trained: Ben's code loads these files into the model's context with every question.

**Who owns what:** Samira writes the facts and the rules. Ben loads them, enforces the schema and runs the tests.

**Button labels: Samira is the master labeller.** The control ids in `controllers/ps5.json` are the single source of truth. Ben's `src/controller/manifest.ts` and the node names in Lawrence's 3D model must use these exact ids. If a name needs to change, change it here first (Samira), then everywhere else.

**Games are swappable.** Everything about one game lives in its own folder under `games/`. To switch the tutor to another game, change `game` in `active-game.json`. Nothing else changes. To add a game, copy a folder and fill in the three files.

```
knowledge/
  active-game.json          ← the switch: "game": "overcooked2" (or "fortnite")
  system-prompt.md          game-neutral rules
  output-schema.json        multi-step answer format (extends TutorReply)
  controllers/ps5.json      master button labels (Samira)
  games/
    overcooked2/            ← used for the evals
      controls.json         actions → steps, plus coach_notes and to_check_on_ps5
      glossary.json         slang
      tests.csv             eval questions
      expected-answers.json gold answer for each test question
      ps5-check-sheet.md    10-minute sheet to check disputed buttons on a real PS5
    fortnite/               ← swap back in when needed
      controls.json
      glossary.json
      tests.csv
  tools/
    dry-run.mjs             checks expected-answers.json against every rule
    check-model.mjs         checks a .glb's part names against the master labels
```

| File | Owner | Status |
|---|---|---|
| `controllers/ps5.json` | Samira | **Master list of button labels** |
| `games/overcooked2/controls.json` | Samira | 7 usable actions from published guides (`web`), 2 to check on a PS5. Dash and chop/throw are disputed between sources: see `to_check_on_ps5` |
| `games/overcooked2/glossary.json` | Samira | 8 terms, approved by Samira (`approved`) |
| `games/overcooked2/tests.csv` | Samira | 10 eval questions, each with a gold answer. Dry run: 10/10 pass |
| `games/overcooked2/ps5-check-sheet.md` | Anyone with a PS5 | 7 rows to check (dash, chop/throw, wash, pause, emote, switch chef) |
| `games/fortnite/*` | Samira | 25 controls (`web`), 14 slang terms (`approved`), 11 tests with gold answers. Dry run: 11/11 pass |
| `system-prompt.md` | Samira | Done. Game-specific rules live in each game's `coach_notes` |
| `output-schema.json` | Samira + Ben | Decided: multi-step. Ben to extend `validateReply` |

## How Ben uses it (in `sidekick`)

1. Read `active-game.json`. System prompt = `system-prompt.md`, then `controllers/<controller>.json`, `games/<game>/controls.json` and `games/<game>/glossary.json` (only rows with `verified` set to `"device"`, `"web"` or `"approved"`).
2. User message = the person's question.
3. Force the reply into `output-schema.json` with WebLLM: `response_format: { type: "json_object", schema: JSON.stringify(schema) }`.
4. `src/tutor/schema.ts`: extend `validateReply` to loop over `steps`, running the existing per-control checks on each one (known `controlId`, `tilt` only on sticks, `squeeze` only on triggers).
5. `src/controller/manifest.ts`: swap the placeholder Xbox controls for the PS5 ids in `controllers/ps5.json` (adds `touchpad`, `create`, `ps`, `mute`), matching the node names in Lawrence's model.
6. The animation plays `steps` in order; the voice reads `spoken`, then each `say`.
7. Run `games/<game>/tests.csv` (merged into `evaluation/cases.json`) after every change. For the evals the game is Overcooked! 2.

## Tools

```sh
node knowledge/tools/dry-run.mjs              # active game; or: dry-run.mjs fortnite
node knowledge/tools/check-model.mjs public/assets/controller.glb
```

`dry-run.mjs` checks each gold answer: schema shape, real PS5 buttons, tilt/squeeze on the right parts, only verified rows, `needs` steps first, steps copied exactly from the game file, matches `tests.csv`, under 15 words per step, no "simply"/"just". `check-model.mjs` lists which master labels are missing from the model and suggests renames.

## Before the demo

- [x] Fortnite PS5 defaults (Builder Pro) filled in from a published guide: rows are `verified: "web"`
- [ ] Check them on a real PS5 controls screen, then change `"web"` to `"device"`
- [x] Glossary approved by Samira for the demo (`verified: "approved"`)
- [ ] Check the glossary with a real Fortnite player
- [ ] Overcooked: fill in `games/overcooked2/ps5-check-sheet.md` on a real PS5, then set those rows to `"device"`
- [ ] When Lawrence's model lands, run `check-model.mjs` and rename its parts to the master labels
