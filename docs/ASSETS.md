# Controller asset contract

No supplied assets were present when this scaffold was built. The visible PS5 reference controller is generated from Three.js primitives, explicitly labelled temporary, and is not a manufacturer model. Blender is available on the initial development machine, but an export has not been tested because there is no source file yet.

## Export from Blender

1. Keep the original `.blend` outside the browser build. Export glTF 2.0 Binary (`.glb`) into `public/assets/controller.glb`, with materials and embedded textures. Record the artist, source, licence and any attribution in this file before publishing the asset.
2. Use metres, controller centred at the origin, face controls on +Y, shoulder edge on -Z. The placeholder is about 4.65 scene units wide; adapt the manifest's camera positions for the actual asset scale. Do not flatten the hierarchy or recenter individual meshes during runtime import.
3. Give each selectable moving group the exact `node` name in `src/controller/manifest.ts`. Use the 19 master IDs in `knowledge/controllers/ps5.json` exactly. Use unique names. All 19 names are required by the current loader.
4. Put pivots at trigger hinges and stick centres. Depress buttons along their local axis; adjust `movement.axis`, `movement.range`, and `rotation` in the manifest. Parent the decorative parts to the moving group. Original position, rotation, hierarchy, materials and textures are retained. Rotation and translation are applied as offsets and restored on release.
5. Set `manifest.asset` to `/assets/controller.glb`, `temporary` to false, and update the embedded asset label. The public embed API does not yet expose model hot-swapping. Run the app and inspect every selection from front, shoulders and rear. A missing required node rejects the asset instead of silently misbinding controls.
6. Check hit occlusion, labels, outline readability, texture colour spaces, polygon and texture sizes, rest transforms, trigger travel and stick clicks with reduced motion both on and off.

The current loader uses procedural movement. Artist animation clips are preserved by glTF loading but are not played yet. When clips arrive, add a typed clip-name mapping and an `AnimationMixer`, validate names, and restore the rest pose on cancellation. `highlights` is reserved for splitting a control across multiple meshes; currently outlines follow all meshes in its named group. Avoid baking a whole controller into one mesh, which prevents independent interaction.

A headless Blender export can use `blender --background source.blend --python export.py`, with a script calling `bpy.ops.export_scene.gltf(filepath='controller.glb', export_format='GLB')`. Review export options for the installed Blender version. No source assets or export script are required for this scaffold.
