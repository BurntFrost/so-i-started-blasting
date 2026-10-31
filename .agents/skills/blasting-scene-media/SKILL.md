---
name: blasting-scene-media
description: Create and integrate original scene assets and synchronized sound for So I Started Blasting using its local media pipeline, fallbacks, and provenance records.
---

# Scene media author

Read the brief, `tools/README.md`, `docs/film-audio.md`, and `dist/assets/SOURCES.md` only as relevant. Reuse available assets before generating new ones. You may use **Blender, Unity, and any other installed Mac software** to author, animate, simulate, bake, render or convert media. Follow [the Mac toolchain guide](../blasting-scene-director/references/mac-toolchain.md) for discovery, existing creative/audio environments, app access and export into this site. Routine use of installed tools is already authorized.

Read [cinematic quality and interaction](../blasting-scene-director/references/cinematic-quality.md). Author appealing silhouettes, cohesive materials and purposeful visual/audio accents for the final camera and UI composition. Judge assets at their browser display size and in motion; choose sculpted, simplified or exaggerated forms when they look better than literal realism. Detail and simulation complexity must earn their place in the image.

## Original sound

Every new catalogue scene needs its own `bed-<id>` entry and local MP3 under the current tests. Compose its 30-second bed and optional transient cues using the existing SoX/FFmpeg synthesis patterns in `tools/author-audio.py`. Add only the requested scene to the generator and use its selective scene argument so existing audio is not regenerated.

Register literal URLs in `audioFiles` and map the bed/cues in `sceneSoundtracks` in `dist/audio.js`. Cues must be sorted and strictly inside 0–30 seconds. Tie them to the brief's visual event times. Preserve the consent gate, shared simulation clock, speed changes, and suppression of old cues during scrubbing. Use original synthetic textures; do not default to film soundtrack clips or cloned actor voices.

Listen to the output and check duration, levels, cue alignment and abrupt edges. Existing targets are documented in `tools/README.md`; treat them as the project's mix reference. If synthesis is unavailable, report the blocker and keep the geometry prototype explicitly incomplete rather than silently borrowing another scene's bed or weakening coverage tests.

## Geometry and textures

Build a procedural baseline before optional GLB/WebP/HDR upgrades. Use explicit output paths in a scratch directory and the existing Blender/glTF toolchain when needed. Validate models and inspect them in the browser before replacing assets. Keep optional media local, with literal URLs and the existing loading deadline, cancellation and disposal conventions. Failure must retain the procedural scene.

Record creator/source, license or generation method, conversion steps, and final paths in `dist/assets/SOURCES.md`. After review, update only the intentionally added or changed files' byte lengths and SHA-256 values in `tools/asset-baseline.json`; the verifier does not discover new assets automatically. Run `npm run assets:verify` and audio tests, then build.

Return created files, provenance, commands run, listening/visual observations and any fallback limitations. Serialize manifest and `dist/audio.js` edits with the builder. Do not enable Blender auto-start, change its listener access, or overwrite unrelated media to make a tool available.

## Gotchas

- Regenerated MP3/GLB bytes may vary across tool versions; a new checksum is not evidence of acceptable sound or geometry.
- Seed Blender's procedural noise explicitly as well as Python's random generator. Verify repeatability in two independent Blender processes; a repeated export from one process can hide a missing seed.
- Geometry exported as a JavaScript source module is required build input, not an optional runtime download. Validate its topology, size and browser appearance; use the existing optional-loader fallback contract for separately loaded GLB/textures.
- A passing browser test does not establish material quality. Inspect exposed fracture faces during the flash and after cooling on both node and classic renderers.
- Runtime audio must remain opt-in even when the skill generated it successfully.
- A silent prototype can be previewed, but a new catalogue entry cannot pass the current complete soundtrack contract without its own bed.
