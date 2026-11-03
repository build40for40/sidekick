# Controller disappearance investigation

3 November 2026. Investigation against the bundled `src/assets/controller.glb`, Three.js 0.187.0 and the current `ControllerScene`.

## Implemented correction

The bundled GLB now exports `1011` as `OPAQUE` and uses a new `1001-solid` opaque variant for solid controls and trim. The eight clear caps retain the original blended `1001` material. Both variants share the existing textures. `scripts/fix-controller-materials.mjs` reapplies these assignments to the audited export and is idempotent.

Compared with the pre-fix asset, all binary chunks and every JSON field other than material definitions and primitive material assignments are unchanged. Geometry, textures, hierarchy, node transforms, pivots and UVs are preserved. The standard loader now receives correct material settings directly; no production runtime overrides are needed. Asset regression tests require every solid mesh to remain opaque and every clear cap to remain blended.

The evidence below describes the original export. The diagnostic now starts with the corrected asset and can reconstruct the old material flags for comparison.

## Finding

Reproduced a material occlusion error in desktop in-app Chromium: from the normal front camera `[0, 6.2, 5.6]`, the white touchpad surface disappears and a dark surface shows instead. Moving the camera changes which surfaces appear on top. The diagnostic's opaque-solid-material variant restores the white touchpad at exactly the same camera position, without changing geometry, transforms, camera clipping planes, lights or postprocessing.

The primary confirmed cause is unnecessary alpha blending on solid surfaces, with depth writing disabled. This is an export/material-assignment issue carried through to the renderer, rather than evidence of insufficient depth-buffer precision. The reproduction does not require zooming inside the controller.

## Evidence

The GLB contains three materials, all double-sided:

| Material | Exported alpha mode | Used by | Base-colour alpha evidence |
| --- | --- | --- | --- |
| `1011` | `BLEND` | White shell and touchpad parts | Texture alpha 242–255; sampled shell vertex UVs are 255, touchpad parts 250–255 |
| `1001` | `BLEND` | Black body trim, sticks, triggers, control bases **and** clear button caps | Texture alpha 25–255; sampled clear-cap vertex UVs are around 51 (20% opacity), most solid-part vertex UVs are 255 |
| `1002` | Default `OPAQUE` | Remaining body mesh | JPEG base-colour texture has no alpha |

Alpha ranges were measured from embedded base-colour textures using Sharp. Per-part samples used vertex UVs, not exhaustive coverage of every rasterized triangle; texture padding can contain unused alpha values.

The installed `GLTFLoader` explicitly maps `BLEND` to `transparent = true` and `depthWrite = false`. `ControllerScene.polish()` copies these flags when upgrading the imported materials, and control registration clones them again. Setting opacity to 1 alone would still multiply by the base-colour texture alpha and retain transparent sorting.

Three.js sorts transparent objects but does not solve arbitrary triangle ordering inside a mesh. Solid faces that do not write depth cannot reliably hide surfaces rendered later. This asset includes several shell primitives under the same pivot and both opaque and translucent parts sharing one material. See the [Three.js transparency manual](https://threejs.org/manual/pages/transparency.html) and [material documentation](https://threejs.org/docs/pages/Material.html).

The current `.1`/`80` camera clipping range was unchanged in the successful comparison. All imported materials are already double-sided, so adding `DoubleSide` is not a remedy for this reproduction.

## Reproduce and compare

1. Run `npm ci` and `npm run dev`. If the default npm cache is unwritable, use `npm ci --cache /private/tmp/sidekick-npm-cache`.
2. Open `http://127.0.0.1:5173/evaluation/controller-render.html`.
3. Observe the corrected white front-view touchpad, then select **Use legacy export** to reproduce the missing surface. Select **Use corrected asset** to restore it.
4. Use the named angle buttons or drag to orbit. **Compare current view** captures the original and candidate with the same camera. **Sweep 32 angles** captures eight yaw angles at four elevations, at radius 8. **Reset** returns to interactive mode.

The page uses the real scene, loader, bundled asset, lights and postprocessing. It changes only `transparent` and `depthWrite` on solid-part material instances to reconstruct the legacy export. It keeps the eight clear cap meshes on their original blending settings. The mesh-name list is specific to this GLB and must be re-audited if the asset changes. The page intentionally accesses TypeScript-private fields for diagnosis; it is not part of the public embed API or the production build entry points.

Browser work included free orbiting, front/side/rear/underside/oblique presets and generation of the 32-angle comparison sheet. The front-view before/after is the clearest confirmed reproduction. This is a visual diagnosis, not an automated pixel assertion that every possible angle is correct.

## Asset correction applied

Correct the materials in the Blender source or in a reproducible GLB processing step:

1. Export solid shell/touchpad material `1011` as `OPAQUE`, reviewing the nearly opaque touchpad trim visually.
2. Split material `1001` into an opaque variant for body trim, sticks, triggers and solid control bases, and a blended variant for genuinely clear caps. They can share the existing textures. Preserve node names, pivots, transforms, hierarchy and UVs.
3. Keep the clear caps blended initially. In the current asset these are `dpad-left_mesh_7`, `dpad-down_mesh_10`, `dpad-up_mesh_14`, `dpad-right_mesh_16`, `square_mesh_40`, `cross_mesh_41`, `triangle_mesh_44`, and `circle_mesh_45`.
4. Verify orbiting, animated presses, trigger travel, selection occlusion and highlights after re-export. The loader will then receive correct depth-writing defaults without runtime mesh-name exceptions.

A targeted runtime material override can serve as a short-term fix: **both** `transparent = false` and `depthWrite = true` for the known solid parts before registration. The comparison page demonstrates that approach. Avoid a blanket override: it removes the intended transparency of the face-button and D-pad caps.

Changing `renderOrder`, increasing depth precision, or disabling depth testing would not correct the material classification. Alpha testing is appropriate for intentional cutout textures, not for these partially transparent caps. A later review could assess physically based transmission for clear plastic if the cap appearance needs improvement; it is not needed to demonstrate the solid-part occlusion fix.

## Validation and limits

- `npm ci` completed using a temporary cache; audit reported zero vulnerabilities.
- `npm test`: 93 tests across 13 files passed.
- `npm run build`: passed, including the demo, library, workers and declarations. Existing large-bundle warnings remain.
- After applying the correction, the actual app rendered the restored white touchpad and solid body correctly in desktop in-app Chromium, including a manual orbit check. The repair script was also verified byte-for-byte idempotent, and the node contract still finds all 19 control IDs. Safari, mobile browsers and Blender's viewport were not tested.
- No Blender source was present in this checkout. This investigation does not establish watertight topology or correct normals everywhere, and does not claim that every possible disappearance has the same cause.
- The candidate deliberately retains the original clear-cap transparency; any remaining cap-specific sorting artifacts require a separate check after the solid-material correction.
