import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const bytes = readFileSync(new URL('../src/assets/controller.glb', import.meta.url));
const asset = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as {
  materials: { name: string; alphaMode?: string; pbrMetallicRoughness: unknown }[];
  nodes: { name: string; mesh?: number }[];
  meshes: { primitives: { material: number }[] }[];
};
const clearCaps = new Set([
  'dpad-left_mesh_7', 'dpad-down_mesh_10', 'dpad-up_mesh_14', 'dpad-right_mesh_16',
  'square_mesh_40', 'cross_mesh_41', 'triangle_mesh_44', 'circle_mesh_45',
]);

it('exports every solid controller surface as opaque while keeping all eight clear caps blended', () => {
  // Guard the real shipped asset against the export regression that made the touchpad disappear.
  const found = new Set<string>();
  for (const node of asset.nodes) {
    if (node.mesh === undefined) continue;
    const clear = clearCaps.has(node.name);
    if (clear) found.add(node.name);
    for (const primitive of asset.meshes[node.mesh].primitives) {
      expect(asset.materials[primitive.material].alphaMode ?? 'OPAQUE', node.name)
        .toBe(clear ? 'BLEND' : 'OPAQUE');
    }
  }
  expect(found).toEqual(clearCaps);
});

it('shares the original control textures between opaque bases and transparent caps', () => {
  const caps = asset.materials.find(material => material.name === '1001')!;
  const solids = asset.materials.find(material => material.name === '1001-solid')!;
  expect(caps).toBeDefined(); expect(solids).toBeDefined();
  expect(solids.pbrMetallicRoughness).toEqual(caps.pbrMetallicRoughness);
  expect({ ...solids, name: caps.name, alphaMode: caps.alphaMode }).toEqual(caps);
});
