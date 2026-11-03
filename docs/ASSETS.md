# Controller asset contract

## Current asset: PS5 DualSense (`src/assets/controller.glb`)

- Source: "Playstation 5 Dualsense" (https://skfb.ly/opKOx) by AHarmlessPotato, licensed CC Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/). The credit is shown as a link in the embedded view's corner note (full text in its tooltip). Keep it there.
- Modified from the Sketchfab 1k-texture GLB: the three material-grouped meshes were split into loose parts, each control's parts were grouped under a pivot node named after its manifest ID, pivot offsets were baked into each part's vertices, the Sketchfab root transforms were replaced by one `controller` node (+Z up, +Y towards the shoulders, scale 2.3), and the rest of the shell was regrouped under `body`. About 112k triangles, 5MB. `node knowledge/tools/check-model.mjs src/assets/controller.glb` finds all 19 master labels.
- Inside `controller`, presses move along local -Z; triggers rotate about local X around a hinge at their top edge; stick tilts rotate about local X (up/down) or Y (left/right). See `movement` in `src/controller/manifest.ts`.
- The scan's baked emissive map is switched off at load. Materials are upgraded to clearcoat physical materials in `ControllerScene.polish`.
- Solid materials export as `OPAQUE`: `1011` for the shell/touchpad and `1001-solid` for solid controls/trim. The eight clear button caps retain the original blended `1001` material and share its textures with the solid variant. After an export from the original source, run `node scripts/fix-controller-materials.mjs` to reapply the audited assignments without changing transforms or binary geometry/textures. See [the rendering investigation](CONTROLLER-RENDERING.md). Re-audit the cap list if mesh names or materials change.
- Avoid glTF `extras` on pivot nodes: in testing, a node with an `extras.pivot` key loaded with a zero translation in three.js.
- Game moves come from Samira's knowledge pack: web-sourced, not yet checked on a console. While a game is selected the embed's corner note says so.
- The GLB lives in `src/assets/` and `manifest.ts` imports it with `?url`, so Vite emits it beside the built chunks and it resolves wherever `dist/` is deployed. Files in `public/` would resolve from the site root and break the embed under a sub-path.
- If the GLB fails to load, the generated placeholder is shown with an error notice.

## Earlier scaffold notes

No supplied assets were present when this scaffold was built. The generated PS5 reference controller is built from Three.js primitives, is not a manufacturer model, and is now only a fallback.

## Export from Blender

1. Keep the original `.blend` outside the browser build. Export glTF 2.0 Binary (`.glb`) into `src/assets/controller.glb`, with materials and embedded textures. Record the artist, source, licence and any attribution in this file before publishing the asset.
2. Use metres, controller centred at the origin, face controls on +Y, shoulder edge on -Z. The placeholder is about 4.65 scene units wide; adapt the manifest's camera positions for the actual asset scale. Do not flatten the hierarchy or recenter individual meshes during runtime import.
3. Give each selectable moving group the exact `node` name in `src/controller/manifest.ts`. Use the 19 master IDs in `knowledge/controllers/ps5.json` exactly. Use unique names. All 19 names are required by the current loader.
4. Put pivots at trigger hinges and stick centres. Depress buttons along their local axis; adjust `movement.axis`, `movement.range`, and `rotation` in the manifest. Parent the decorative parts to the moving group. Original position, rotation, hierarchy, materials and textures are retained. Rotation and translation are applied as offsets and restored on release.
5. Import the file in `manifest.ts` with `?url` and assign it to `manifest.asset`, `temporary` to false, and update the embedded asset label. The public embed API does not yet expose model hot-swapping. Run the app and inspect every selection from front, shoulders and rear. A missing required node rejects the asset instead of silently misbinding controls.
6. Check hit occlusion, labels, outline readability, texture colour spaces, polygon and texture sizes, rest transforms, trigger travel and stick clicks with reduced motion both on and off.

The current loader uses procedural movement. Artist animation clips are preserved by glTF loading but are not played yet. When clips arrive, add a typed clip-name mapping and an `AnimationMixer`, validate names, and restore the rest pose on cancellation. `highlights` is reserved for splitting a control across multiple meshes; currently outlines follow all meshes in its named group. Avoid baking a whole controller into one mesh, which prevents independent interaction.

A headless Blender export can use `blender --background source.blend --python export.py`, with a script calling `bpy.ops.export_scene.gltf(filepath='controller.glb', export_format='GLB')`. Review export options for the installed Blender version. No source assets or export script are required for this scaffold.
