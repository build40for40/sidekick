// Repair the bundled DualSense export's material assignments without touching geometry or pivots.
// Usage: node scripts/fix-controller-materials.mjs [path/to/controller.glb]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = process.argv[2] ?? fileURLToPath(new URL('../src/assets/controller.glb', import.meta.url));
const source = readFileSync(path);
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2
  || source.readUInt32LE(8) !== source.length || source.readUInt32LE(16) !== 0x4e4f534a) {
  throw Error('Expected a glTF 2.0 binary with a leading JSON chunk');
}
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8'));
const shell = gltf.materials.findIndex(material => material.name === '1011');
const shared = gltf.materials.findIndex(material => material.name === '1001');
if (shell < 0 || shared < 0) throw Error('Expected the audited DualSense materials 1011 and 1001');

// Eight clear cap meshes, identified by their exported nodes and checked against the texture alpha.
// Keep their original BLEND material; solid control bases use the new opaque variant.
const caps = [
  'dpad-left_mesh_7', 'dpad-down_mesh_10', 'dpad-up_mesh_14', 'dpad-right_mesh_16',
  'square_mesh_40', 'cross_mesh_41', 'triangle_mesh_44', 'circle_mesh_45',
];
const capMeshes = new Set(caps.map(name => {
  const nodes = gltf.nodes.filter(node => node.name === name);
  if (nodes.length !== 1 || nodes[0].mesh === undefined) throw Error(`Expected one cap mesh node: ${name}`);
  return nodes[0].mesh;
}));
if (capMeshes.size !== caps.length) throw Error('Clear caps must have independent meshes');
for (const index of capMeshes) {
  if (!gltf.meshes[index].primitives.every(primitive => primitive.material === shared)) {
    throw Error('Clear cap material assignments changed; re-audit the asset before repairing');
  }
}
if (gltf.materials[shared].alphaMode !== 'BLEND') throw Error('Expected blended clear cap material');
let solid = gltf.materials.findIndex(material => material.name === '1001-solid');
if (solid < 0) {
  solid = gltf.materials.length;
  gltf.materials.push({ ...structuredClone(gltf.materials[shared]), name: '1001-solid', alphaMode: 'OPAQUE' });
}
gltf.materials[shell].alphaMode = 'OPAQUE';
gltf.materials[solid].alphaMode = 'OPAQUE';
gltf.meshes.forEach((mesh, index) => {
  if (capMeshes.has(index)) return;
  for (const primitive of mesh.primitives) if (primitive.material === shared) primitive.material = solid;
});

// Only the JSON chunk changes. Preserve all following chunks byte for byte, including embedded
// textures, geometry, accessors' binary offsets and any unknown extension chunks.
const json = Buffer.from(JSON.stringify(gltf));
const paddedLength = Math.ceil(json.length / 4) * 4;
const tail = source.subarray(20 + jsonLength);
const output = Buffer.alloc(20 + paddedLength + tail.length, 0x20);
source.copy(output, 0, 0, 20);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(paddedLength, 12);
json.copy(output, 20);
tail.copy(output, 20 + paddedLength);
if (!output.equals(source)) writeFileSync(path, output);
console.log('Solid shell and control parts are opaque; all eight clear caps retain BLEND.');
