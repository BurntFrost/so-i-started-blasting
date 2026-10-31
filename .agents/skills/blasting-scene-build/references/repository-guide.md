# Repository map for scene authors

Verified against this checkout and the live site on 2026-10-30. Re-read owning code when it changes; this is guidance, not a frozen API.

## Source and runtime

The app is static ESM JavaScript, currently using pinned Three.js 0.186.1 and Node 24. `dist/` is editable source. `npm run build` fingerprints assets/modules into ignored `build/`. `npm run serve` serves the build on `http://127.0.0.1:4174` by default. No scene-generation backend exists. The installed TypeSafe SDK dependency is not integrated into this authoring workflow.

The default renderer is node-based WebGPU with a WebGL backend fallback. `?renderer=webgl` selects node/WebGL; `?renderer=classic` selects the older WebGL composer. Read `dist/simulation.js` for current query handling. These renderer backends are separate from a scene config's `renderer` (`original`, `terrestrial`, `cosmic`).

| File | Authoring responsibility |
| --- | --- |
| `dist/scenes.js` | Stable IDs, film/version, trusted picker/title markup, description, three phase labels, scene order |
| `dist/scene-config.js` | World, initial camera/target, fog, lighting, grade, optional hero emitter |
| `dist/terrestrial.js` | Lazy factories for city/landscape events; `factories`, `loaded`, `update`, `updateView` |
| `dist/cosmic.js` | Lazy space factories and their update/view hooks |
| `dist/simulation.js` | Shared city/landscape objects, original invasion scene, timeline/UI, world resets, environment application |
| `dist/cinema.js`, `dist/render-kit.js` | Adaptive detail, finishing, shared effects and volumes |
| `dist/shader-program.js`, `dist/node-materials.js` | Custom shader capture and node material adaptation |
| `dist/audio.js`, `tools/author-audio.py` | Literal audio assets, unique beds, cue timing and local synthesis |
| `tools/capture-media.mjs` | Separate ordered capture catalogue, hero times, quality profiles and screenshot helpers |
| `dist/assets/SOURCES.md`, `tools/asset-baseline.json` | Provenance and explicit byte/checksum records |

Useful examples: `createTornado` for landscape weather; `createNuclear` for city destruction; `createTsunami` for volumes; the cosmic factories for orbit and planets. Do not copy their entire shader complexity for a simpler request.

## Factory contract

Both managers construct a factory lazily, attach its group once, and hide the previous group. Their call contracts differ:

- Terrestrial calls `update(clampedTime, detail, config)`, with LITE `0`, BALANCED `1`, HIGH/ULTRA `2`, and requires a `particles` array. It passes `camera` to `updateView(camera)` and supports `leave()` for restoring shared state.
- Cosmic calls `update(clampedTime, quality)` with `lite`, `balanced`, `high`, or `ultra`. Its manager adjusts particle draw ranges and a returned `fragments` mesh count using `userData.total`. It calls `updateView()` without arguments; cosmic factories use the enclosing camera. A typical return is `{group, update, fragments}` when fragment thinning is needed.

Seed variation during construction. Restore the same visible state for an identical timestamp regardless of prior seeks. Always assign uniforms/transforms/visibility, including inactive-phase values. Review shared building or landscape changes on switch-out as well as seeking backward.

`markEffects()` moves transparent/additive objects out of the opaque depth layer and disables their shadows. Physical surfaces that must retain depth can opt in with `userData.opaqueDepth = true`; an opaque material with `alphaHash` can preserve depth during a dissolve. The GORT refinement exposed background ambient occlusion drawing across a transparent figure and sphere. Check these choices in HIGH as well as phone tiers, since phones omit that occlusion pass, and verify the dissolve across all renderers and reverse seeks.

The shared simulation applies environment after scene-local updates; scene-local fog changes would be overwritten. Hero lights in terrestrial scenes stay attached to an always-visible root and change intensity to avoid node shader recompilation from a changing light signature.

`syncUI()` uses optional `phaseTimes: [eventStart, aftermathStart]` from the scene config, defaulting to 10 and 19 seconds; the three timeline labels are static. Terminator 2 uses 4/13 and Dante's Peak uses 6/13.5 to align their visible events and existing audio cues. A brief's beat boundaries do not automatically update this runtime config. Verify the displayed labels around each threshold.

Orbit controls clamp the default camera to a 300-unit maximum distance. A scene needing a wider composition can set `cameraMaxDistance` in its config; reset and scene selection apply it before updating the camera. Check framing against the actual canvas size with the title and player controls visible, including phones.

## New custom shaders

Use normal materials/current helpers where possible. A changed shader must be collected and emitted for the node renderer. After adding the new scene to both catalogues:

1. `npm run build`
2. Start `npm run serve` in a separate terminal/session.
3. `TEST_BASE_URL=http://127.0.0.1:4174 node tools/collect-shader-programs.mjs`
4. `node tools/tsl-generate.mjs`
5. `node tools/tsl-generate.mjs --check`
6. Rebuild serially, then run renderer tests and view frames.

The collector deliberately uses classic rendering so an ungenerated node shader can still be captured. It overwrites `tools/tsl-captured-programs.json`; the generator overwrites `dist/node-fields.js`. Assign a single owner and inspect both diffs. Translation failures are implementation work, not reasons to silently fall back to classic for the whole site. Current collection visits 18 seconds per scene; if new shader variants are constructed at other times, extend collection to cover those states before generating.

## Complete scene integration

Add catalogue, configuration and grade, factory map, capture entry, unique sound bed, relevant cues and media provenance/checksums. Keep capture order equal to catalogue order. `tests/scene-contract.test.mjs` and `tests/audio.test.mjs` compare exact sets. `tests/capture-media.test.mjs` currently also asserts the count 15; update that assertion for an intentional addition. Several classic geometry checks contain explicit index lists; include the added scene or use catalogue-derived coverage without dropping the budget assertion. Node browser tests iterate the catalogue.

Use literal paths such as `/assets/audio/bed-example.mp3`. The build rejects computed asset filenames. New optional assets must preserve procedural fallback and the existing lifecycle cancellation/disposal behavior.

The existing `navigator.modelContext` tool, `set_apocalypse_scene`, accepts scene index and seconds and only selects/seeks existing content. It is not a scene-creation API. No API keys or runtime model calls are needed for Codex to edit, build and preview a scene.
