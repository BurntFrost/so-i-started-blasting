# Engine migration (approach C) design

Written 2026-09-16 alongside `2026-09-16-graphics-pipeline-pass-design.md` (approach A).
Approach A stays on the pinned Three.js 0.170 WebGL renderer. This document is the other
road: moving the anthology to the current Three.js release and, beyond that, to the
WebGPU renderer and its node-based shading language, TSL. It is written so the decision can
be taken on facts, and its recommendation is to take the first half only after approach A
has landed, and the second half only for effects that A cannot give.

Facts below were checked against the installed 0.170.0, the published 0.186.0 package and
the project's migration guide for every release in between. 0.187 is in development.

## Why consider it at all

Approach A is bounded by two things the WebGL renderer cannot change:

- **Every effect is a separate full-screen pass on `EffectComposer`.** Ambient occlusion,
  light shafts, bloom, output and film each read and write the whole frame. The WebGPU
  renderer's post-processing is a node graph compiled into as few passes as the data flow
  allows, and its effect library already contains what A builds by hand and more.
- **Custom shading is string surgery.** Twelve of the anthology's materials are patched
  through `onBeforeCompile` by replacing shader chunk names, and twenty-eight more are raw
  GLSL `ShaderMaterial` programs. TSL expresses the same as composable functions that the
  renderer compiles to WGSL or GLSL, which is what makes the node post-processing possible.

What the current release offers that A cannot, all in `examples/jsm/tsl/display` of 0.186:
screen-space reflections (`SSRNode`), screen-space global illumination (`SSGINode`),
subsurface scattering (`SSSNode`), depth of field (`DepthOfFieldNode`), lens flares
(`LensflareNode`), god rays (`GodraysNode`), 3D LUT grading (`Lut3DNode`), FSR upscaling
(`FSR1Node`), order-independent transparency (`OITPassNode`), plus bloom, GTAO, SSAO, FXAA,
SMAA, film grain, chromatic aberration and sharpening as nodes. Temporal anti-aliasing and
motion blur are there too and remain excluded for the same reason as in A: frame history
breaks exact scrubbing.

## Two phases, three gates

### C1. Version bump on WebGL: 0.170 to 0.186

Keep `WebGLRenderer`, GLSL and the composer; only the engine version changes. The
migration guide lists 102 changes across the sixteen releases; these are the ones that
touch this codebase.

| Release | Change | Where it lands |
|---|---|---|
| 179 to 180 | `RGBELoader` renamed to `HDRLoader` | `dist/production.js` imports the sky loader; the old name still ships as an alias in 0.186 but the rename is the supported path |
| 181 to 182 | `PCFSoftShadowMap` deprecated, `PCFShadowMap` is now soft; in 0.186 the old value warns and falls back | `dist/cinema.js` sets the shadow map type |
| 180 to 181 | PBR indirect specular and energy conservation changed; rough materials get brighter; PMREM reflections improved | every standard material: facades, ground, water, ship, trees. A look shift, not a break |
| 182 to 183 | `RoomEnvironment` moved, so its PMREM lights differently | `dist/cinema.js` uses it as the environment before the HDR arrives |
| 183 to 184 | environment map rotation aligned with object rotation | the sky dome and PMREM in `dist/production.js`; check the sun side of reflections |
| 173 to 174 | `RenderTarget.clone()` no longer shares texture resources | `EffectComposer` clones its second buffer; behaviour is now the safe one |
| 175 to 176 | `CapsuleGeometry` parameter `length` renamed `height` | Evangelion's units and giant use positional arguments, so nothing changes |
| 174 to 175 | `SMAAPass` constructor dropped width and height | only if A's optional SMAA is adopted |
| 177 to 178 | multiply and subtractive blending need premultiplied alpha | not used; every effect is additive or normal |
| build | `three.module.js` now imports `three.core.js` | `tools/vendor.mjs` already follows relative imports inside the vendored prefix; the version assertion `0.170.0` and `tests/build.test.mjs` change |

Two consequences are worth stating plainly. First, the engine download grows: the vendored
0.170 engine is 1.28 MB, 260 KB gzipped; 0.186's core plus module is 2.07 MB, 409 KB
gzipped. Second, the shadow chunk that approach A's soft-shadow patch (A4) replaces changed
shape in 0.186: the PCF path now samples a `sampler2DShadow` with hardware comparison. If A4
lands before C1, the patch is rewritten once during C1.

Everything else in the anthology is unaffected: chunk names used by the patches
(`common`, `begin_vertex`, `color_fragment`, `emissivemap_fragment`, `normal_fragment_maps`,
`roughnessmap_fragment`, `tonemapping_fragment`, `colorspace_fragment`) all exist in 0.186;
the composer, `UnrealBloomPass`, `OutputPass`, `GTAOPass` and the FXAA shader all ship; the
loaders, controls and instancing are unchanged.

**Gate C1.** The fifteen-scene ULTRA sheet against the pre-bump sheet, with the PBR and
PMREM shifts retuned where they matter (the water and the ship hull are the most
reflective surfaces); frame-rate probes on the five heaviest scenes; `npm run check`; the
download growth accepted or offset by dropping `three.module.min.js` style dead weight the
vendoring already excludes.

**Effort.** One to two days, most of it the sheet review.

### C2. WebGPU renderer with the WebGL 2 fallback

`WebGPURenderer` in 0.186 chooses the WebGPU backend when `navigator.gpu` is present and
falls back to its WebGL 2 backend otherwise, or on request with `forceWebGL`. One code path
serves both, and the fallback is what CI's SwiftShader and Playwright's WebKit will run.

**What must change.** The renderer only understands node materials. `ShaderMaterial` and
`onBeforeCompile` do not exist on this path, so every custom program is rewritten in TSL.
The inventory today:

| Module | Raw GLSL programs | Chunk patches | Notes |
|---|---|---|---|
| `dist/cosmic.js` | 15 | 2 | photosphere, corona sprite, flash, ejection bubble, engulf shell, Earth, clouds, atmosphere rims, black hole, engines, particles |
| `dist/terrestrial.js` | 5 plus 5 marched volumes | 4 | particles, rim glow, radiant giant, funnel mesh, textured surfaces |
| `dist/atmosphere.js` | 3 | 0 | nebula dome, cloud dome, mist billboards |
| `dist/production.js` | 2 | 2 | sky panorama, fireball, lawn plots, facade windows on the kit |
| `dist/cinema.js` | 1 | 4 | particles, facades, water v3, snow and foam sprites |
| `dist/baked-explosion.js` | 1 | 0 | flipbook atlas |
| `dist/volumes.js` | 1 generator, 8 instances | 0 | the march loop |
| `dist/simulation.js` | 0 | 0 | six `PointsMaterial` systems patched from cinema |

Forty custom programs and twelve patches, about 2,500 lines of GLSL inside template
strings, become TSL functions. Some of it gets simpler: the water becomes a
`MeshStandardNodeMaterial` with `normalNode`, `colorNode`, `roughnessNode` and
`emissiveNode` instead of four chunk replacements, and the facade windows likewise. Some of
it stays hard: the march loop becomes a TSL `Loop` over a `Fn`, and the particle factories
move their closed-form motion into `positionNode` on `PointsNodeMaterial`, which handles
size attenuation itself. Noise comes from TSL's MaterialX functions instead of the hand
written hash.

**Renderer API deltas the simulation touches.**

- `await renderer.init()` before the first frame; the `webgl-init` failure stage becomes a
  device-init stage and `webglcontextlost` listeners become `renderer.onDeviceLost`.
- `renderer.info.render.triangles` and draw calls exist, so the phone budget and telemetry
  keep working. `getMaxAnisotropy`, pixel ratio, size, animation loop, output colour space,
  tone mapping including AgX, exposure and shadow map settings all exist.
- MSAA through `antialias: true` is available, but the WebGL backend cannot share a depth
  texture with a multisampled target unless the `WEBGL_multisampled_render_to_texture`
  extension exists; it falls back to single-sample rendering with a warning. Post-processing
  antialiasing (SMAA or FXAA nodes) is the portable choice.
- `PMREMGenerator` exists for the renderer; the room environment and the HDR sky keep
  working, with the 183 rotation alignment applied.
- Post-processing is `RenderPipeline` (called `PostProcessing` before 183) with a
  `scenePass` node feeding effect nodes. `EffectComposer` and every `Pass` class go away.

**Weight.** The WebGPU build ships both backends in one file: `three.webgpu.js` is 2.23 MB,
436 KB gzipped, on top of `three.core.js` at 281 KB gzipped, plus `three.tsl.js` at 7 KB.
That is about 724 KB gzipped against 260 KB today, before any effect nodes. The build
vendors prebuilt files and cannot tree-shake them; offsetting this means adopting a bundler
in `tools/build.mjs`, which is a change to the deterministic fingerprinting design and needs
its own review.

**Determinism.** Unchanged in principle: TSL programs are pure functions of their inputs,
and the same closed-form-of-time rule applies. Two backends produce different pixels for
the same frame, but the reverse-scrub assertions compare within one session, so they hold
on either. Temporal nodes stay excluded.

**Browser reach.** As of this writing WebGPU is available in current Chrome and Edge on
desktop and Android, in Safari 26 on macOS and iOS, and in Firefox on Windows with other
platforms following. The fallback backend covers the rest, so the audience does not shrink;
the phones that run LITE and BALANCED would mostly run the WebGL backend anyway.

**Gate C2.** Every scene renders on both backends with the fifteen-scene sheet matching the
C1 sheet within tuning, the reverse-scrub assertions pass on the fallback in CI, the phone
budget holds, first-frame time on a phone is measured against today with the heavier
engine, and at least one effect that motivated the move (screen-space reflections on the
Deep Impact ocean, depth of field on the space scenes, or SSGI in the city) is shown on
the sheet.

**Effort.** Three to four weeks: a week for the renderer, loop, loaders and simulation
plumbing on the fallback backend; two weeks porting the eight modules of shaders in the
order simulation, cinema, production, atmosphere, baked explosion, volumes, terrestrial,
cosmic, each behind its existing factory interface so scenes can be checked one at a time;
a week for the node post-processing graph and the tuning sheet.

## Recommendation

1. Do approach A first. Its five pieces are the visible upgrade and none of them needs a
   new engine.
2. Take C1 as its own small pull request after A, or during A if the 0.186 addons prove
   more convenient. Its cost is one sheet review and a shadow-patch rewrite.
3. Hold C2 until there is a concrete effect the anthology wants that only the node graph
   gives, and until the download growth has an answer. The strongest candidates are
   reflections on the Deep Impact ocean and SSGI in the city scenes. If neither is wanted,
   C2 is not worth three weeks and a heavier first load.

## Files

C1 touches `package.json`, `tools/vendor.mjs`, `tests/build.test.mjs`,
`dist/production.js` (loader), `dist/cinema.js` (shadow type, and A4's patch if present),
and the docs.

C2 touches every module under `dist/` except `audio.js`, `analytics.js`, `telemetry.js`,
`runtime-state.js`, `scenes.js` and `scene-config.js`; `tools/vendor.mjs` gains the
`three/webgpu` and `three/tsl` specifiers; `tools/build.mjs` gains a bundler if the weight
is to be offset; `tests/render-lifecycle.test.mjs` keeps working because node materials
construct in Node without a renderer, but its snapshot helper must learn node uniforms.

## Risks

- **A look shift disguised as a bug.** C1's PBR and PMREM changes alter every reflective
  surface at once. Mitigated by the sheet review and by retuning `envMapIntensity` and
  roughness where it shows, before any other change in the same pull request.
- **Two backends, two truths.** A scene may be correct on WebGPU and wrong on the fallback
  or the reverse. Mitigated by running the sheet on both, and by CI covering the fallback.
- **The port stalls in the middle.** Forty programs across eight modules cannot ship half
  done. Mitigated by porting behind the factory interfaces, one module per pull request,
  with the old renderer still selectable until the last module lands.
- **Weight on phones.** A 724 KB gzipped engine before scenes load. Mitigated only by a
  bundler, which is why C2 waits for a decision on that too.
