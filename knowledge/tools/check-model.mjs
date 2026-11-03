// Checks a 3D controller model's node names against the master labels in controllers/ps5.json.
// Usage: node tools/check-model.mjs path/to/controller.glb   (or a .gltf)
// Ben's loader (docs/ASSETS.md) needs one uniquely named node group per control.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) { console.log('Usage: node tools/check-model.mjs path/to/controller.glb'); process.exit(2); }

function readGltfJson(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) return JSON.parse(buf.toString('utf8')); // plain .gltf
  const length = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('First GLB chunk is not JSON');
  return JSON.parse(buf.subarray(20, 20 + length).toString('utf8'));
}

const gltf = readGltfJson(file);
const names = (gltf.nodes ?? []).map((n) => n.name).filter(Boolean);
const labels = JSON.parse(readFileSync(join(root, 'controllers/ps5.json'), 'utf8')).buttons;
const loose = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let missing = 0;
console.log(`${file}: ${names.length} named nodes\n`);
for (const b of labels) {
  if (names.includes(b.id)) { console.log(`✓ ${b.id}`); continue; }
  missing++;
  const near = names.filter((n) => {
    const l = loose(n);
    return [b.id, b.name, ...b.aka].some((x) => l === loose(x) || l.includes(loose(b.id)));
  });
  console.log(`✗ ${b.id}${near.length ? `   (rename? found: ${near.join(', ')})` : '   (no matching part)'}`);
}

const dupes = names.filter((n, i) => names.indexOf(n) !== i);
if (dupes.length) console.log(`\nDuplicate names (loader needs unique ones): ${[...new Set(dupes)].join(', ')}`);
const ids = new Set(labels.map((b) => b.id));
const extra = names.filter((n) => !ids.has(n));
if (extra.length) console.log(`\nOther nodes (fine if decorative): ${extra.join(', ')}`);

console.log(`\n${labels.length - missing}/${labels.length} master labels found in the model`);
process.exit(missing ? 1 : 0);
