// Dry run: checks games/<game>/expected-answers.json against the knowledge pack's rules.
// Usage: node tools/dry-run.mjs [game]   (defaults to the game in active-game.json)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const active = load('active-game.json');
const game = process.argv[2] ?? active.game;
const controller = load(`controllers/${active.controller}.json`);
const controls = load(`games/${game}/controls.json`);
const glossary = load(`games/${game}/glossary.json`);
const answersPath = `games/${game}/expected-answers.json`;
if (!existsSync(join(root, answersPath))) {
  console.log(`No ${answersPath} yet.`);
  process.exit(0);
}
const { answers } = load(answersPath);

const buttons = new Map(controller.buttons.map((b) => [b.id, b]));
const actions = new Map(controls.actions.map((a) => [a.id, a]));
const usable = (v) => v === 'device' || v === 'web' || v === 'approved';

// Minimal CSV reader: handles quoted fields with commas.
const tests = readFileSync(join(root, `games/${game}/tests.csv`), 'utf8')
  .trim().split('\n').slice(1)
  .map((line) => {
    const cells = [...line.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].map((m) => m[2] ?? m[1]);
    return { question: cells[0], found: cells[1] === 'true', actions: cells[2], controls: cells[3] };
  });

const split = (s) => (s ? s.split('>').map((x) => x.trim()) : []);
let failures = 0;

for (const test of tests) {
  const problems = [];
  const entry = answers.find((a) => a.question === test.question);
  if (!entry) {
    console.log(`✗ ${test.question}\n    no expected answer written`);
    failures++;
    continue;
  }
  const r = entry.reply;

  // Shape (output-schema.json)
  for (const k of ['spoken', 'found', 'actionId', 'steps', 'jargon']) if (!(k in r)) problems.push(`missing ${k}`);
  if (r.spoken.length > 420) problems.push('spoken over 420 characters');
  if ((r.spoken.match(/[.!?](\s|$)/g) ?? []).length > 2) problems.push('spoken is more than two sentences');
  if (r.steps.length > 6) problems.push('more than 6 steps');

  // Tone rules
  const allText = [r.spoken, ...r.steps.map((s) => s.say)].join(' ');
  if (/\b(simply|just)\b/i.test(allText)) problems.push('uses "simply" or "just"');

  // found = false means no steps
  if (r.found !== test.found) problems.push(`found is ${r.found}, test expects ${test.found}`);
  if (!r.found && r.steps.length) problems.push('found is false but there are steps');

  // Action must exist and be usable
  if (r.actionId) {
    const a = actions.get(r.actionId);
    if (!a) problems.push(`actionId ${r.actionId} is not in controls.json`);
    else if (!usable(a.verified)) problems.push(`actionId ${r.actionId} is not verified`);
  }

  // Jargon must come from an approved glossary term
  if (r.jargon) {
    const t = glossary.terms.find((g) => g.term === r.jargon.term);
    if (!t) problems.push(`jargon "${r.jargon.term}" is not in glossary.json`);
    else if (!usable(t.verified)) problems.push(`jargon "${r.jargon.term}" is not approved`);
  }

  // Each step: real button, right motion, under 15 words
  for (const [i, s] of r.steps.entries()) {
    const b = buttons.get(s.controlId);
    if (!b) { problems.push(`step ${i + 1}: ${s.controlId} is not a PS5 button`); continue; }
    if (s.action === 'tilt' && b.motion !== 'stick') problems.push(`step ${i + 1}: tilt on a non-stick`);
    if (s.action === 'squeeze' && b.motion !== 'trigger') problems.push(`step ${i + 1}: squeeze on a non-trigger`);
    if (s.direction && s.action !== 'tilt') problems.push(`step ${i + 1}: direction without tilt`);
    if (s.say.length > 120) problems.push(`step ${i + 1}: say over 120 characters`);
    if (s.say.split(/\s+/).length >= 15) problems.push(`step ${i + 1}: say is 15+ words`);
  }

  // Steps must copy the expected actions' ps5 lists, in order
  const expectedSteps = split(test.actions).flatMap((id) => {
    const a = actions.get(id);
    if (!a) { problems.push(`test names unknown action ${id}`); return []; }
    if (!usable(a.verified)) problems.push(`test expects unverified action ${id}`);
    return a.ps5;
  });
  const want = expectedSteps.map((s) => `${s.action}:${s.controlId}:${!!s.hold}:${s.times ?? 1}`).join(' > ');
  const got = r.steps.map((s) => `${s.action}:${s.controlId}:${!!s.hold}:${s.times ?? 1}`).join(' > ');
  if (want !== got) problems.push(`steps don't match the game file\n      want ${want || '(none)'}\n      got  ${got || '(none)'}`);
  const gotControls = r.steps.map((s) => s.controlId).join(' > ');
  if (gotControls !== split(test.controls).join(' > ')) problems.push(`controls ${gotControls || '(none)'} ≠ tests.csv ${test.controls || '(none)'}`);

  // needs: the needed action's steps come first
  const a = r.actionId && actions.get(r.actionId);
  if (a?.needs && split(test.actions)[0] !== a.needs) problems.push(`${r.actionId} needs ${a.needs} first, but tests.csv doesn't list it`);

  if (problems.length) { failures++; console.log(`✗ ${test.question}\n    ${problems.join('\n    ')}`); }
  else console.log(`✓ ${test.question}`);
}

console.log(`\n${game}: ${tests.length - failures}/${tests.length} pass`);
process.exit(failures ? 1 : 0);
