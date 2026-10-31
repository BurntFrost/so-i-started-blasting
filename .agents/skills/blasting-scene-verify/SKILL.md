---
name: blasting-scene-verify
description: Verify a new or refined So I Started Blasting scene with real browser frames, exact reverse scrubbing, renderer coverage, phone budgets, and audio behavior.
---

# Scene reviewer

Read the brief, current diff, and [verification guide](references/verification.md). Review against the intended movie moment and explicit acceptance criteria. A test pass does not establish composition, readability, or cinematic timing.

Read [cinematic quality and interaction](../blasting-scene-director/references/cinematic-quality.md). Judge cinematic appeal and UI/animation experience explicitly: composition, lighting, palette, material finish, pacing, visual clarity and responsive controls. Successful stylization is acceptable; realism alone is not a quality verdict.

Use **Blender, Unity, and other installed Mac software** to inspect source assets, animations, exports and reference renders when helpful. Follow [the Mac toolchain guide](../blasting-scene-director/references/mac-toolchain.md), preserve review-only ownership, and verify the final imported result in the website as well as its authoring app.

Use an already running local preview only after checking that it serves the current build. Otherwise build and serve serially. Record the URL, renderer, quality, scene ID, times, screenshot paths, commands and exit statuses in `work/scene-authoring/<id>/review.md`. When delegated review-only work, do not modify application code; report actionable findings to the owner. Test-generated ignored build/evidence files are expected.

Inspect anticipation, main event and aftermath at the brief's capture times, plus 0 and 30 seconds. Check the recognizable subject, event visibility, foreground/background separation, camera orbit while paused, readable UI and mobile composition. View actual screenshots. Do not approve images from filenames or test exit codes alone.

Watch a complete normal-speed playback and record the observed rhythm, transitions, impact and aftermath. Exercise controls with the scene and overlays visible; check that moving effects do not obscure labels or feedback. Report visual/experience findings separately from functional tests, and request refinement for unattractive or awkward results even when the technical checks pass. State an unobserved playback review explicitly.

Prove exact reverse seeking at a fixed quality after optional assets settle, switch away and back, and exercise replay/pause/speed. Check renderer/console errors and real changing canvas pixels. Include the default node/WebGL path and classic; test native WebGPU when supported and state a skip honestly when it is unavailable. Include BALANCED and LITE budgets as well as HIGH visual evidence. ULTRA is conditional on affected ULTRA assets/geometry.

Verify audio consent and synchronization when sound changes. New optional assets also need a failed-request fallback check. Run the full release gate before calling a scene release-ready; record environment failures separately from scene defects.

Return a concise verdict: **verified locally**, **needs fixes**, or **blocked**, followed by evidence and precise untested behavior. Do not claim physical-device performance from desktop software rendering, a public deployment from a local preview, or a new movie scene from the generic factory example.

## Gotchas

- A reverse-pixel comparison is meaningless if quality or asset readiness changed between captures.
- `capture` uses the registered hero time and does not accept `--second`; use the timeline for arbitrary beat frames.
- A live page may load fine in local Chrome while a remote scraper reports WebGL failure. Keep those observations separate.
