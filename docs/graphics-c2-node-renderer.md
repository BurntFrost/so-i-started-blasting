# Native graphics renderer

The default renderer is Three.js r186's WebGPURenderer with automatic WebGL fallback.
`?renderer=webgpu` explicitly selects the same automatic path;
`?renderer=webgl` forces the native node renderer's WebGL backend.
`?renderer=classic` retains the previous renderer for comparison.

## Scene and material ownership

Factory updates still own their original objects and absolute-time uniform holders.
`node-materials.js` substitutes native materials while the frame is drawn and restores
factory references in `finally`, including failed draws. Point systems draw instanced
quads using their original position/seed arrays; draw ranges become instance counts.
The physical triangle counter includes both triangles per particle.

Surface descriptors identify the nine former shader-chunk patches. Their native
materials retain deformation before instance transforms and colour changes after
vertex colours. The opaque prepass clones these materials so its silhouettes match
the colour pass. CPU material updates remain live through shared properties/holders.

## Offline custom shader conversion

The generated module contains all 51 custom program variants collected from the
fifteen scenes at BALANCED, HIGH and ULTRA startup ceilings. Runtime lookup uses
the exact vertex/fragment source and sorted defines. Unknown programs fail explicitly.
No GLSL parser or transpiler runs in the browser.

Two implementation details differ from the initial design: the port retains the
original noise functions to preserve the authored look, and renders point effects
as instanced quads so both backends have the same size/atlas/depth behaviour. Neither
choice introduces stateful simulation or temporal accumulation.

After changing a shader:

1. Run `npm run build` and serve it locally.
2. Run `TEST_BASE_URL=http://127.0.0.1:4186 node tools/collect-shader-programs.mjs`.
3. Run `node tools/tsl-generate.mjs`, then rebuild.
4. Run unit tests and both native backend browser projects.

`node tools/tsl-generate.mjs --check` verifies deterministic output. The offline
normalizer validates explicit inputs, preserves GLSL local/parameter storage, lowers
inline early returns, and rejects unsupported constructs. It preserves the original
noise equations and absolute-time motion; it does not substitute different noise.

Legacy fragment coordinates remain bottom-left for deterministic field math. Only
opaque-depth samples are converted to native top-left texture UVs. The adapter adjusts
inverse projection for WebGPU's 0-to-1 clip depth. The native postprocessing graph
uses backend-aware reconstruction directly.

## Finishing graph

A separate opaque layer-zero normal/depth pass feeds GTAO, volume clipping, and soft
particles. Effects on layer one do not occlude themselves. The graph applies spatial
AO filtering, quarter-resolution radial shafts, optional Deep Impact reflections,
bloom, output conversion, FXAA and absolute-time film grain. It uses no frame history.
Deep Impact's water surfaces are explicitly marked as SSR receivers.

Native sun PCSS performs sixteen blocker reads and sixteen filter reads. Its shadow
texture is readable raw depth; other lights retain their comparison samplers.

## Validation commands

```sh
npm test
npm run build
TEST_BASE_URL=http://127.0.0.1:4186 PLAYWRIGHT_CHANNEL=chrome npm run test:node:webgl
TEST_BASE_URL=http://127.0.0.1:4186 PLAYWRIGHT_CHANNEL=chrome npm run test:node:webgpu
TEST_BASE_URL=http://127.0.0.1:4186 node tools/probe-renderer-startup.mjs
```

The browser projects require the named backend, visit every scene at multiple times,
assert exact reverse-scrub pixels within that backend, reject shader warnings/errors,
and check the existing phone primitive budget. Pixel checks hide overlapping DOM and
require visible scene content above the film-grain range before comparing hashes.
WebGPU and WebGL pixels need not be
byte-identical to each other. Visual sheets and performance probes are separate gates.

Component GPU checks for all generated programs, PCSS, and the postprocessing graph
have passed both backends. The film pass also compares gray/color patches with the
classic output within one byte. CI runs the native fallback's fifteen-scene checks
alongside the existing Chromium and WebKit regressions.

The startup probe reports three cold-context samples per backend and decoded script
bytes on a 390x844 touch viewport. This uses the host's desktop GPU, not a physical
phone. The larger engine remains a tradeoff: the additional WebGPU engine module is
about 444 KB gzipped, the TSL entry about 8 KB, and generated custom programs about
35 KB, plus native display addons. No runtime transpiler or bundler was introduced.

## Engine realms

`three.module.js` and `three.webgpu.js` are separate prebuilt engines, but both
re-export the shared `three.core.js`, so 436 of the 444 `three` exports are the same
object in either build. A scene built by the node-engine modules therefore renders
under the classic `WebGLRenderer` without translation. `PMREMGenerator` is the only
export whose implementation differs, so each runtime supplies its own; `ShaderChunk`,
`ShaderLib`, `UniformsLib`, `UniformsUtils`, `WebGLCubeRenderTarget`, `WebGLRenderer`
and `WebGLUtils` exist only in the classic build.

Application modules import `three/webgpu`; only `classic-runtime.js`, `ao-pass.js` and
`light-shafts-pass.js` import `three`. Addons import the bare `three` specifier, so
`tools/vendor.mjs` resolves it per realm from whichever module reached the addon, and
throws if one addon is pulled into both. `simulation.js` imports the classic runtime
dynamically, so `?renderer=classic` is the only way to fetch that engine: it keeps
411,760 bytes (101,536 gzipped, about 20% of the site's JavaScript) out of first load.
`tests/engine-split.test.mjs` asserts the boundary in both directions.

Review evidence and current cross-browser status are recorded in
[PR #35](https://github.com/BurntFrost/so-i-started-blasting/pull/35).
