# Remaining graphics implementation

Branch: `codex/remaining-graphics`, starting at `ef0a1f3`.

User scope: implement the remaining A4, A5, A3, C1 and C2 work in a branch.
The existing `codex/render-performance` checkout and its uncommitted package changes
are outside this worktree and remain untouched.

## Sequence and verification

1. A4: deterministic contact-hardening shadows, world bounds, targeted tests.
2. A5: absolute-time hero lights, quarter-resolution radial shafts, paused-orbit projection.
3. A3: reproducible particle atlas, optional-load fallback, opaque-depth intersection fade.
4. Integrate A: full checks, fifteen-scene ULTRA captures, performance and reverse-scrub probes.
5. C1: migrate the pinned engine to 0.186, adapt loaders, shadow/depth APIs and build graph;
   verify before attributing visual differences to the renderer migration.
6. C2: port material programs and postprocessing to TSL, verify both WebGPU and WebGL fallback,
   preserve the working renderer until all scene factories satisfy the migration gate.
7. Review changes and leave the completed work committed on the branch. No production merge.

## Evidence

- Baseline: 118 unit tests passed; build succeeded; all 15 ULTRA captures completed in
  `work/remaining-before`.
- A5 targeted tests cover emitter envelopes, camera projection, quarter-resolution sizing,
  ping-pong feedback avoidance and target restoration after render failure.
- A integration: 136 unit tests passed (two opt-in GPU tests skipped), all 78 authored
  asset checksums verified, build produced 121 fingerprinted assets. Chromium suite
  passed 10/11 initially; the remaining telemetry test lost its browser process and
  passed in isolation. The added atlas-download failure/reverse-scrub test passed.
- All fifteen ULTRA after captures completed and were visually inspected against the
  baseline (`work/remaining-a-after/contact-sheet.jpg`). No scene or effect disappeared.
- Knowing at 18s: adaptive quality stepped ULTRA to HIGH, with FPS samples 29 and 57;
  no renderer errors. This is not a claim that all scenes sustain ULTRA at 60 FPS.
- WebKit could not start because its Playwright binary was missing. Both the initial and
  180-second-timeout downloads failed across all Playwright mirrors; this gate is unverified.
- Independent review fixed invisible snow/foam fragments writing depth and integrated
  the starfield with the atlas. The focused particle GPU suite passed 8/8 afterward.
- PCSS GPU checks passed on both r170 and r186, including native reversed depth on r186,
  zero shader errors and byte-identical restored frames. Its dual-revision guard is
  included now; the r186 dependency activation belongs to C1.
- Deep Impact at 18s stepped ULTRA to HIGH, FPS samples 36 and 60; no renderer errors.

## C1 verification

- Pinned Three.js 0.186.0. HDRLoader replaces RGBELoader. GTAO's renamed internal
  methods retain the same seeded noise and shared-depth scheduling. The PCSS blocker
  search uses r186's raw native depth via BasicShadowMap; it is not stock Basic filtering.
- The fifteen-scene ULTRA sheet (`work/remaining-c1-after/contact-sheet.jpg`) was
  captured and reviewed against the A sheet. PBR brightness shifts are visible but
  no surface or effect disappeared; no compensating scene grade was necessary.
- Chromium: 11/12 on the first pass; the failed startup-error test lost its browser
  process during navigation and passed in isolation. All fifteen-scene reverse-scrub,
  HIGH/ULTRA, optional asset, audio, phone and context-loss checks passed.
- Latest unit run: 143 passed, three opt-in GPU tests skipped (includes initial C2 shadow
  tests under active development); 78 asset checksums and ten certificate tests passed.
- WebKit remains unverified because both download attempts failed. Five heavy-scene
  C1 probes completed without renderer errors: Independence Day 50/59 FPS, Deep Impact
  42/48, Twister 48/44 and Evangelion 46/46 at ULTRA; Knowing stepped to HIGH at 36/60.

## C2 validation findings

- The initial per-scene hash checks passed both backends, but the visual sheet exposed
  black output. Film grain alone supplied changing, reversible pixels, so hash checks
  were insufficient. The suite now also requires visible scene pixels above the grain
  range. Those earlier passes are not treated as visual evidence.
- Native raw-uniform binding must distinguish `Color` from `Vector3` even when the GLSL
  declaration is `vec3`: the native uploaders read `rgb` and `xyz` respectively. Using
  the vector uploader for a Color produced NaNs that propagated through compositing.
  The adapter now preserves the shared holder using a native `color` reference.
- The native film pass now uses explicit `mix(gray, color, saturation)`. TSL's
  chained form interprets the receiver as the interpolation factor; the initial
  translation incorrectly brightened every scene. Flat gray now matches classic
  output exactly (150/255 for linear 0.18), and colored patches/saturation endpoints
  match within one byte on both backends. No exposure compensation was applied.
- AO is attenuated by exponential/linear fog visibility so roof silhouettes do not
  darken dense fog. Both backend component GPU checks passed after this correction.
- Integrated main's `94891e1` adaptive resolution and development diagnostics. Native
  WebGPU statistics use renderer timestamp support; WebGL retains the composer query.
- Reverse-scrub diagnostics isolated two particle sampling hazards. Atlas mip reads
  now occur before per-fragment bounds rejection, preserving defined derivatives.
  Native soft-depth reads use clamped integer texels and actual rasterized fragment
  depth. This retains fading while removing history-dependent edge pixels. The
  previously failing seven-scene WebGPU sequence and actual WebGL compilation/reversal
  passed with the final fix; pixel assertions remain exact.
- Software-rendered CI runs native fallback tests across four shards. The required
  `quality` check aggregates core validation and every shard. The harness excludes
  only ANGLE's specific internal render-pass flush performance notice, retaining
  shader errors, validation warnings and context-loss failures. The governor test
  supplies fixed slow frame intervals rather than multiplying host-dependent stalls.

## Native renderer measurements

- All fifteen ULTRA scenes were captured and visually reviewed on native WebGPU and
  native WebGL after the color, film and fog corrections. Both capture manifests
  reported zero renderer errors. Sheets: `work/remaining-c2-webgpu-final/contact-sheet.jpg`
  and `work/remaining-c2-webgl-final/contact-sheet.jpg`.
- Cold browser contexts at a 390x844 touch viewport, using this Mac's GPU without CPU
  or network throttling: median first frame over three samples was 937 ms classic,
  2654 ms native WebGL and 2519 ms WebGPU. Decoded JavaScript was 2,799,148 bytes for
  classic and 5,696,745 bytes for native. These are desktop proxies, not measurements
  from physical phones. Raw evidence: `work/renderer-startup/startup.json`.
- Two one-second WebGPU samples per scene at ULTRA: Independence Day 60/59 FPS,
  Deep Impact 60/60, Knowing 57/45, Twister 60/53 and Evangelion 44/60. Knowing and
  Evangelion retained ULTRA detail at 90% render resolution; the other scenes stayed
  at 100%. All probes reported zero renderer errors. These short probes do not
  establish sustained performance and use shorter windows than the earlier C1 probes.
- Development statistics, GPU timing, playback and scene switching passed on native
  WebGPU, native WebGL and the retained classic postprocessing prototype.
- WebKit passed in GitHub Actions for commit `81fe0d7`; its earlier local download
  failure is no longer a cross-browser validation gap. Full CI and the remaining
  native WebGPU reverse-scrub investigation are tracked in draft PR #35.

## Implementation decisions

- Work is isolated because the original checkout is being used for render-performance work.
- Shafts use three six-tap radial blur passes, with guards for zero distance and all four
  screen borders. They read the existing HDR image and do not add a depth prepass.
- Emitters behind the camera or outside the expanded viewport disable the pass. Projection
  updates on every rendered frame, including orbiting a paused timeline.
- Verification results and remaining migration gaps will be recorded explicitly; creating
  a WebGPU entry point alone does not count as completing C2.
