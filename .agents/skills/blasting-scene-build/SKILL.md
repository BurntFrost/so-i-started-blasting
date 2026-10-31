---
name: blasting-scene-build
description: Implement or refine a movie-inspired 3D scene in this repo's Three.js renderer with reversible animation, adaptive detail, and complete catalogue integration.
---

# Scene builder

Read the brief and [repository guide](references/repository-guide.md). Validate the brief with the director's `scene-brief.mjs` helper. Inspect existing edits before changing files. Use the repository's ESM JavaScript conventions; do not introduce a TypeScript build system for an isolated scene.

Read [cinematic quality and interaction](../blasting-scene-director/references/cinematic-quality.md). Build for attractive composition, clear action, expressive timing and responsive controls. Stylize scale, trajectories, lighting and materials when that improves the movie experience; keep the result coherent and preserve deterministic playback.

Use **Blender, Unity, and any other installed Mac software** for modeling, animation, effects prototyping, baking or export when useful. Follow [the Mac toolchain guide](../blasting-scene-director/references/mac-toolchain.md), coordinate authoring-project ownership with the media agent, and integrate exported results into the existing browser renderer.

## Construct the scene

- Choose the nearest existing factory in `dist/terrestrial.js` or `dist/cosmic.js`. The [starter factory](assets/scene-factory.js) demonstrates the actual return shape with ordinary materials; it is a runnable placeholder effect, not a completed movie interpretation.
- Establish a strong silhouette, focal lighting and framing with the actual UI visible before adding detail. Shape anticipation, acceleration, impact and settling from absolute time; watch normal-speed playback to catch awkward motion that seek tests miss. Keep effects from obscuring the event or controls, and maintain clear feedback during scrubbing, orbit and replay.
- Allocate geometry and seeded variation once. Assign position, rotation, scale, visibility, material state and shader time from absolute `t` on each update. Never accumulate `+= delta`, `Date.now()`, frame-count state, or fresh randomness during animation.
- Preserve meaningful silhouettes at LITE and BALANCED; add particle density, tessellation and volumetrics only at higher tiers. Terrestrial factories receive detail `0`, `1`, or `2` (HIGH/ULTRA share `2`); cosmic factories receive a quality string. Follow the actual manager contract in the repository guide.
- Return the owning manager's shape: terrestrial needs `{ group, update, particles: [] }`; cosmic can expose `fragments` for manager-controlled thinning. Use the manager's `updateView` convention for camera-dependent effects and terrestrial `leave()` for shared-state restoration when needed. Keep camera-dependent uniforms current during paused orbit.
- Keep lighting/fog in `scene-config.js` and shared environment ownership. Follow existing always-visible hero-light patterns when additional point lights are necessary; hiding light parents can trigger shader regeneration.
- Reuse regular materials and current shader helpers first. For a new or changed custom shader, follow the capture → generate → rebuild sequence in the guide. Do not hand-edit `dist/node-fields.js`.

## Integrate completely

For an added scene, use a unique stable ID in `dist/scenes.js`, `dist/scene-config.js` (including grade), the correct factory map, and `tools/capture-media.mjs`. Match the capture list's order to the catalogue because shader collection currently selects by index. Review shared-world effects in `dist/simulation.js`; new shared geometry interactions need explicit reset behavior.

Supply all catalogue copy, three phases and three labels. The UI contains trusted authored HTML; escape any reference-derived content and restrict deliberate title markup to the existing `<br>` convention. Never evaluate user text as code or paste fetched HTML into the catalogue.

Coordinate a unique sound bed and any cues with `$blasting-scene-media`. Update count-specific assertions in `tests/capture-media.test.mjs` for the expanded catalogue; preserve exact catalogue coverage rather than weakening it. Verify the new ID enters browser coverage and the phone geometry budget. Update the README scene table for additions.

For refinements, edit only the owning factory/config/media and the brief. Preserve unrelated scenes and dependency versions. Shared buildings or landscape mutations must restore on scene switch as well as reverse seek.

Run relevant unit checks, build serially, then use `$blasting-scene-verify`. Implementing a factory without registration, sound integration and browser evidence is an unfinished scene.

## Gotchas

- `dist/` is editable source; `build/` is generated and must not be patched.
- Literal local asset URLs are required for fingerprinting. Computed filenames fail the build.
- Terrestrial needs `particles: []` when there are no particles; cosmic instead discovers particle metadata by traversing the group.
- The Armageddon workflow exposed different factory arguments: cosmic passes a quality string, not terrestrial's numeric detail. The starter supports both, but check the owning manager before integrating a factory.
- Classic WebGL success alone does not validate the default node renderer.
- Optional textures can finish while the timeline is paused. `atmosphere-ready` requests a render only; if readiness changes scene visibility or transforms, also refresh the scene state (the existing `explosion-ready` handler calls `updateWorld`). Expose a scene readiness state and test delayed success, failure and paused orbit, as in Deep Impact’s mist.
