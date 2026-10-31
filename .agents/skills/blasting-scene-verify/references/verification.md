# Scene verification

Run from the repo root using the pinned Node version and existing lockfile. Build output is shared: never run concurrent builds or rebuild underneath a test. Check port ownership before starting or stopping servers; do not terminate somebody else's process.

## Fast checks and preview

```sh
node .agents/skills/blasting-scene-director/scripts/scene-brief.mjs validate work/scene-authoring/SCENE_ID/brief.json
node --test tests/scene-contract.test.mjs tests/audio.test.mjs tests/capture-media.test.mjs
npm run assets:verify
npm run build
npm run serve
```

Keep the server in a separate terminal/session. For new shader work complete the [generation sequence](../../blasting-scene-build/references/repository-guide.md) before node renderer checks. The existing audio and capture tests require complete integration even for a new geometry prototype.

## Captures

```sh
node tools/capture-media.mjs capture --quality balanced --scene SCENE_ID --output work/scene-authoring/SCENE_ID/balanced
node tools/capture-media.mjs capture --quality high --scene SCENE_ID --output work/scene-authoring/SCENE_ID/high
```

`capture` uses the hero time from `SCENES`. It cannot accept arbitrary `--second` and has no LITE preset. Use browser controls or the existing Playwright `seekTimeline(page, seconds)` and `settleFrames(page)` exports for beat frames and 0/30 endpoints. Select `.scene-card[data-scene-id="..."]`, seek with `#progress`, and screenshot `#world`. The existing browser tests demonstrate asset readiness and exact pixel comparisons.

Wait for optional assets to be ready or their documented fallback state. Pause playback and lock/confirm the same quality for both comparison images. Capture at A, then B, then A; require A to match exactly and B to differ. Repeat after switching scenes to expose leaked shared state. Check orbit while paused, replay, speed, keyboard controls and narrow layout.

For native renderer checks against the already running preview:

```sh
TEST_BASE_URL=http://127.0.0.1:4174 PLAYWRIGHT_CHANNEL=chrome npm run test:node:webgl -- --grep SCENE_ID
TEST_BASE_URL=http://127.0.0.1:4174 PLAYWRIGHT_CHANNEL=chrome npm run test:node:webgpu -- --grep SCENE_ID
```

Quote the ID if the shell needs it. Verify the runner selected at least one test. Native test names include scene IDs. These targeted checks do not include all suite-level budget cases. Classic browser and WebKit checks cover separate behavior; run them for integration/release readiness. If installed Chrome is unavailable, use installed Playwright browsers or report the missing prerequisite; do not install duplicate tooling automatically.

## Performance and sound

Before measuring performance, complete the visual and interaction review in
[cinematic quality and interaction](../../blasting-scene-director/references/cinematic-quality.md).
Watch the whole 30-second sequence at normal speed with the player UI visible;
record what was actually observed. Inspect desktop and phone framing, focal
lighting, coherent colors/materials, anticipation/impact/settling, readable text
and responsive controls. Review both the complete motion and representative stills.
Report art direction and UX findings separately from technical test results;
passing budgets or pixel comparisons do not establish an appealing experience.

The current phone regression budget is fewer than 150,000 rendered triangles. Exercise BALANCED and forced LITE via existing test patterns; inspect draw calls, errors and visible effects, not triangles alone. Desktop HIGH/ULTRA frame probes are diagnostics, not physical-phone FPS guarantees:

```sh
node tools/capture-media.mjs probe --quality high --scene SCENE_ID --second 15 --output work/scene-authoring/SCENE_ID/probe
```

Audio checks: no fetch/play before consent; correct bed after switching; cue crossings during playback only; no historical cues on reverse seek; synchronized pause/replay/speed and volume. Listen to generated audio. For added optional assets, intercept the exact new asset request in local browser tests and check the fallback. Keep error injection off production.

## Release readiness

Stop only a preview server that this task started before the suite starts its own server. Then:

```sh
npm run check
```

If using installed Chrome, prefix `PLAYWRIGHT_CHANNEL=chrome`; WebKit still needs its own installed browser. `npm run check` covers node unit/build tests, certificate-tool unit tests, assets, build, the Chromium controls/lifecycle suite, node/WebGL and WebKit. The Chromium suite now opens the default renderer except for explicit failure/backend cases; it is not comprehensive classic-renderer coverage. Verify `?renderer=classic` explicitly for the changed scene, and run native WebGPU separately. The release gate does not deploy the site or verify physical-device performance.

Record checks as pass/fail/skipped with commands, evidence paths, backend, tier and reasons. Never turn unavailable GPU/browser/media tooling into a passing result. Run additional unrelated checks only when new changes or observed failures justify them.
