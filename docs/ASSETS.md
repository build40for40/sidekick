# Controller asset contract

## Current asset: PS5 DualSense (`src/assets/controller.glb`)

- Source: "Playstation 5 Dualsense" (https://skfb.ly/opKOx) by AHarmlessPotato, licensed CC Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). The credit is shown as a link in the embedded view's corner note (full text in its tooltip). Keep it there.
- Modified from the Sketchfab 1k-texture GLB: the three material-grouped meshes were split into loose parts, each control's parts were grouped under a pivot node named after its manifest ID, pivot offsets were baked into each part's vertices, the Sketchfab root transforms were replaced by one `controller` node (+Z up, +Y towards the shoulders, scale 2.3), and the rest of the shell was regrouped under `body`. About 112k triangles, 5MB.
- Inside `controller`, presses move along local -Z; triggers rotate about local X around a hinge at their top edge. See `movement` in `src/controller/manifest.ts`.
- The scan's baked emissive map is switched off at load. Materials are upgraded to clearcoat physical materials in `ControllerScene.polish`.
- Avoid glTF `extras` on pivot nodes: in testing, a node with an `extras.pivot` key loaded with a zero translation in three.js.
- Fortnite moves in `sequences` come from Samira's knowledge pack: web-sourced, default Builder Pro layout, not yet checked on a console. The embed says so whenever a move plays. Verify them in-game before calling them verified.
- The GLB lives in `src/assets/` and `manifest.ts` imports it with `?url`, so Vite emits it beside the built chunks and it resolves wherever `dist/` is deployed. Files in `public/` would resolve from the site root and break the embed under a sub-path.

## Earlier scaffold notes

No supplied assets were present when this scaffold was built. The visible Xbox-style controller is generated from Three.js primitives, explicitly labelled temporary, and is not a manufacturer model. Blender is available on the initial development machine, but an export has not been tested because there is no source file yet.

## Export from Blender

1. Keep the original `.blend` outside the browser build. Export glTF 2.0 Binary (`.glb`) into `src/assets/controller.glb`, with materials and embedded textures. Record the artist, source, licence and any attribution in this file before publishing the asset.
2. Use metres, controller centred at the origin, face controls on +Y, shoulder edge on -Z. The placeholder is about 4.65 scene units wide; adapt the manifest's camera positions for the actual asset scale. Do not flatten the hierarchy or recenter individual meshes during runtime import.
3. Give each selectable moving group the exact `node` name in `src/controller/manifest.ts`. Semantic IDs are stable; artist node names may be different if the manifest is updated. Use unique names. All 16 names are required by the current loader.
4. Put pivots at trigger hinges and stick centres. Depress buttons along their local axis; adjust `movement.axis`, `movement.range`, and `rotation` in the manifest. Parent the decorative parts to the moving group. Original position, rotation, hierarchy, materials and textures are retained. Rotation and translation are applied as offsets and restored on release.
5. Import the file in `manifest.ts` with `?url` and assign it to `manifest.asset`, `temporary` to false, and update the embedded asset label. The public embed API does not yet expose model hot-swapping. Run the app and inspect every selection from front, shoulders and rear. A missing required node rejects the asset instead of silently misbinding controls.
6. Check hit occlusion, labels, outline readability, texture colour spaces, polygon and texture sizes, rest transforms, trigger travel and stick clicks with reduced motion both on and off.

The current loader uses procedural movement. Artist animation clips are preserved by glTF loading but are not played yet. When clips arrive, add a typed clip-name mapping and an `AnimationMixer`, validate names, and restore the rest pose on cancellation. `highlights` is reserved for splitting a control across multiple meshes; currently outlines follow all meshes in its named group. Avoid baking a whole controller into one mesh, which prevents independent interaction.

A headless Blender export can use `blender --background source.blend --python export.py`, with a script calling `bpy.ops.export_scene.gltf(filepath='controller.glb', export_format='GLB')`. Review export options for the installed Blender version. No source assets or export script are required for this scaffold.
