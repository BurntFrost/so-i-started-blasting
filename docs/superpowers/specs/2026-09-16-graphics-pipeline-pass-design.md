# Graphics pipeline pass (approach A) design

Written 2026-09-16 at Steve's request after the fifteen-scene assessment of 2026-09-15 and
the three per-scene rebuilds that followed it (Twister #25, Deep Impact #26, Knowing #27).
This is the shared-pipeline half of the upgrade: five changes to the render path that lift
every scene at once, on the pinned Three.js 0.170 WebGL renderer. The engine migration is
a separate document, `2026-09-16-engine-migration-design.md` (approach C).

## Context

The assessment captured every scene at ULTRA and found that the weaknesses were shared:

- No ambient occlusion or contact shadow anywhere. One soft 2048 sun shadow plus a
  hemisphere fill leaves buildings, trees and debris floating on the ground.
- Every particle system is point-size dot sprites: sparks, embers, ash, spray, snow, souls,
  the accretion disk. They read as confetti at ULTRA pixel density.
- Hero effects do not light the world. The fireball, the beam, the crosses and the eruption
  glow leave nearby facades unchanged and look composited.
- Bright emissives clip to white under ACES at exposure 1.3. Knowing worked around this
  locally by lowering its photosphere range; Wandering Earth's Jupiter still clips.
- The finishing pass is a tint, saturation and vignette hack appended to the FXAA shader.

The three rebuilt scenes changed subjects, not the pipeline, so each of these still holds for
all fifteen scenes. Three things they did add that this pass builds on: the shared march
generator in `dist/volumes.js`, the capture and frame-rate probes used to tune them, and the
lesson that CI never renders HIGH or ULTRA, so pipeline evidence is local.

## Goals

1. Every scene gains contact shadow, softer sun shadows, textured soft particles, hero
   lighting with light shafts, and a proper film grade with tone mapping that holds colour
   in bright fire and plasma.
2. Phones are untouched. LITE and BALANCED render exactly as today apart from the sprite
   atlas, which is cheaper than the current soft-circle fragment.
3. Reverse scrubbing stays byte-exact and the test suite keeps its screenshot equality
   assertions.
4. Each piece ships as its own pull request with a before-and-after sheet of all fifteen
   scenes, so any piece can be reverted on its own.

## Non-goals

- No renderer or Three.js version change. Everything here exists in 0.170's addons.
- No temporal effects. Temporal anti-aliasing, temporal denoise, motion blur from frame
  history and accumulated reflections would all break scrubbing.
- No screen-space reflections. `SSRPass` in 0.170 needs its own reflective mesh setup and
  is not worth its cost on this content.
- No per-scene content work. Dante's Peak, Day After Tomorrow, Interstellar and Wandering
  Earth remain on the per-scene track.

## Constraints

- **Determinism.** Every pass must be a pure function of the current frame's scene state.
  Noise textures are static, grain is a hash of pixel position and scene time, denoising is
  spatial only. `tests/browser.spec.mjs` compares reverse-scrub screenshots byte for byte.
- **Tiers.** `dist/cinema.js` owns the tier table (LITE, BALANCED, HIGH, ULTRA) and the FPS
  governor. New passes are enabled by tier flags in that table, never by resolution alone.
  The phone budget test asserts fewer than 150,000 triangles at 390x844 BALANCED for the
  listed scenes, so nothing here may add geometry below HIGH.
- **Telemetry and tests.** The canvas exposes `data-quality`, `data-antialias`,
  `data-cinematic-look` and friends, and the browser suite asserts some of them. New passes
  expose their own attribute so the suite can assert the path taken.
- **Assets.** One new asset, the particle atlas, goes through `tools/asset-baseline.json`,
  `dist/assets/SOURCES.md` and the build's fingerprinting like every other file.
- **Review.** Codex reviews every pull request and its threads block merging. It flags
  reversed `smoothstep` edges and duplicated code, so shared helpers stay in one place.

## Architecture

The composer path today, at BALANCED and above:

```
RenderPass -> UnrealBloomPass -> OutputPass -> ShaderPass(FXAA + film hack)
```

LITE renders directly with native multisampling and no grade.

After this pass, at HIGH and ULTRA:

```
RenderPass -> GTAOPass -> LightShaftsPass -> UnrealBloomPass -> OutputPass -> FXAAPass -> FilmPass
```

BALANCED keeps `RenderPass -> Bloom -> Output -> FXAA -> Film`, gaining only the film pass
and the sprite atlas. LITE is unchanged.

Three shared pieces of plumbing make the passes cheap and safe:

- **An effects layer.** Additive and transparent effects (beams, blast spheres, points,
  volumes, sprites) are placed on layer 1 at creation through one helper,
  `markEffect(object)` in `dist/volumes.js`, which becomes `dist/render-kit.js` (see Files).
  The main camera renders layers 0 and 1. GTAO's normal and depth prepass, and the light
  shaft mask, render layer 0 only, so a beam never casts ambient occlusion and a blast
  sphere never occludes a shaft. Without this, GTAO's override material would draw every
  additive sphere as solid geometry.
- **One opaque depth texture per frame.** `GTAOPass` renders its own normal and depth
  prepass into a target whose `depthTexture` is public. Soft particles and the light shaft
  mask read that texture instead of rendering their own prepass. At BALANCED there is no
  GTAO and therefore no depth texture; particles fall back to hard edges and shafts are off.
- **A per-scene grade table.** `dist/scene-config.js` already owns each scene's environment.
  It gains a `grade` object per scene (exposure, bloom strength, bloom radius, tint,
  saturation, grain, aberration, shaft emitter and strength) replacing the `id ===` ladders
  in `cinema.js`. One owner, one place to retune.

## Pieces

### A0. Tooling

Small first pull request so every later one has the same evidence.

- Extend `tools/capture-media.mjs` from twelve scenes to all fifteen, with the hero beats
  used during the rebuilds, and add a `--scene` filter. The current version predates
  Evangelion.
- Add a frame-rate probe to the same tool: play from a given second for seven seconds and
  read `data-fps`, at ULTRA and at HIGH.
- Add `node --check` over `dist/*.js` to `npm test`. The Deep Impact branch shipped a stray
  brace that the unit tests could not see because they never import `cinema.js`; the build's
  module lexer caught it late.
- Add a `compare` helper that diffs two capture sets with ImageMagick and prints pixel
  counts, the check used to prove Twister unchanged after the generator refactor.

Effort: half a day. No rendering change.

### A1. Tone mapping and film grade

**What.** Switch `renderer.toneMapping` from ACESFilmic to AgX, retune each scene's exposure
and bloom for it, and replace the film hack with a real `FilmPass`: grain, chromatic
aberration at the frame edge, the existing vignette, tint and saturation.

**Why AgX.** ACES pushes saturated bright colour toward yellow and white before it clips.
AgX desaturates toward white gradually and keeps hue in the shoulder, which is exactly
where fire, plasma and the sun live. It is darker in the mids, so exposure rises.

**Where.**

- `dist/simulation.js`: `renderer.toneMapping = THREE.AgXToneMapping`; exposure comes from
  the scene grade instead of the fixed 1.3 in `applyEnvironment`.
- `dist/scene-config.js`: the `grade` object per scene. Starting values are the current
  ones translated: exposure 1.3 becomes 1.6 and each scene's bloom strength keeps its
  ratio to the others. Today the strengths are `.48` default, `.22` Day After Tomorrow,
  `.38` The Day the Earth Stood Still, `.12` Interstellar, `.18` Gravity, `.25` other space
  scenes; radius `.65` terrestrial and `.35` space; threshold `1.1`.
- `dist/cinema.js`: the film code moves out of the FXAA shader into its own `ShaderPass`
  after it. Grain is `hash(gl_FragCoord.xy + floor(time * 24) * k)` scaled by `grade.grain`,
  so it flickers at 24 steps per second and is identical for identical time. Aberration
  samples the red and blue channels at `uv + (uv - .5) * grade.aberration` and its
  negative, so it is zero at the centre and only shows at the frame edge. Saturation and
  tint stay as they are. `data-cinematic-look` reports `graded` as before.
- Knowing's photosphere range, lowered on 2026-09-15 to dodge clipping, is raised back
  toward its original values once AgX holds it.

**Retune procedure.** Capture all fifteen scenes at their hero beats before the switch,
apply AgX with the translated grade, capture again, and walk the sheet: exposure first
(midtones of the city, the plain and the sea match the ACES sheet), then bloom strength
(fire and plasma bloom as before, no more), then per-scene tint. Two passes of the sheet
is the budget; the third pass is diminishing returns, as the Knowing rebuild showed.

**Tiers.** All tiers that use the composer, so BALANCED and above. LITE stays native.

**Cost.** One extra full-screen pass at composer resolution, a few texture reads per pixel.

**Tests.** Unit: the grade table has an entry for every catalogue id, and
`tests/scene-contract.test.mjs` extends to it. Browser: `data-cinematic-look` unchanged;
the reverse-scrub equality assertions are the real test of the grain hash.

Effort: one and a half days, most of it the sheet walk.

### A2. Ambient occlusion

**What.** `GTAOPass` from `three/addons/postprocessing/GTAOPass.js` between the render
pass and bloom, at HIGH and ULTRA.

**How it fits.** The pass renders a normal and depth prepass of layer 0 with its override
material, computes ground-truth ambient occlusion from that buffer with a static noise
texture, denoises it with its built-in Poisson filter (spatial, so deterministic), and
blends it into the colour buffer. Parameters to start from: `radius` 6 units, `distanceExponent` 1, `thickness` 1, `scale` 1, `samples` 16, `pdRings` 2, `pdSamples` 16,
`blendIntensity` 1. The city's buildings are 3 to 6 units wide, so a 6 unit radius darkens
alleys and roof edges without darkening whole facades. `setSceneClipBox` bounds the effect
to the active world so the sky dome and the 700 unit ocean plane cost nothing.

**Effects layer.** `GTAOPass.render` is wrapped so `camera.layers` excludes layer 1 during
the prepass and restores it after. Everything marked with `markEffect` is therefore
invisible to the occlusion buffer.

**Resolution.** Full resolution at HIGH. At ULTRA the pass runs at 70% of native and its
result is bilinearly upsampled, the same trade the bloom already makes at that tier, because
GTAO cost scales with pixels and ULTRA on this Mac has no headroom to spare in the city.

**Attribute.** `data-ambient-occlusion` is `gtao` when the pass runs and `none` otherwise.

**Follow-on.** With a scene depth texture available, `marchedVolume` gains an optional
`depthTexture` uniform and ends its march where the ray meets opaque geometry. That removes
the tight-hull heuristic's one known artefact, opaque objects inside a hull margin drawing
behind the volume, for Twister's trees at the funnel's edge and the farm at the wave's foot.

**Tests.** Unit: `markEffect` puts an object on layer 1 and the tier table enables the pass
only for HIGH and ULTRA. Browser: the existing HIGH probe asserts `data-ambient-occlusion`
is `gtao`; the phone probe asserts `none`. Frame rate: the five heaviest scenes at ULTRA
(Independence Day, Terminator 2, Day After Tomorrow, War of the Worlds, Evangelion) hold
60 fps on this Mac or the governor demotes them, and the sheet shows which.

Effort: one day.

### A3. Soft textured particles

**What.** Replace the soft-circle fragment shared by every point sprite with a procedural
sprite atlas and, where the depth texture exists, fade each sprite where it meets geometry.

**Where the sprites are.** Three factories and a handful of standalone systems:
`particles()` in `dist/cinema.js` (sparks, smoke, spray), `particles()` in
`dist/terrestrial.js` (twelve motion kinds from embers to souls) and `particles()` in
`dist/cosmic.js` (seven kinds from the flare stream to the accretion disk), plus the
`PointsMaterial` systems in `dist/simulation.js` (snow, foam, windows, debris) whose
fragment is patched in `cinema.js`.

**Atlas.** `tools/author-particles.py`, Pillow and NumPy like `author-at-field.py`, writes
`dist/assets/particle-atlas.webp`: a 1024 by 1024 sheet of sixteen 256 pixel cells. Four
puffs (fbm smoke at increasing wispiness), four embers (hot core with a soft halo), four
streaks (elongated sparks for the spiral debris and rain), two droplets and two snowflakes.
Cells are generated, not photographed, so provenance stays original. ULTRA does not need a
4K version; sprites never exceed 190 pixels on screen.

**Shader.** Each factory's fragment samples the atlas at a cell chosen from the particle's
seed and the kind's cell range, replacing `1 - smoothstep(r)` and the per-fragment fbm that
the soft kinds compute today. That fbm is the most expensive thing in these shaders; the
atlas is one texture read. Rotation comes from the seed and time for puffs, and from the
motion direction for streaks, computed in the vertex shader from the closed-form position
at `time` and `time + 0.04`, the trick the Twister debris already uses.

**Soft fade.** At HIGH and ULTRA the fragment also reads the GTAO depth texture at
`gl_FragCoord.xy * resolutionInverse`, converts it to view depth, and multiplies alpha by
`smoothstep(0, softness, sceneDepth - fragmentDepth)`. Smoke stops cutting hard lines
through buildings and the ground. At BALANCED and LITE the uniform is absent and the fade is
one.

**Tiers.** Atlas everywhere, fade at HIGH and ULTRA. The atlas is a 1024 texture with
mipmaps, about 300 KB as WebP, loaded once with the other optional assets and falling back
to the current soft circle if it fails, in the pattern of `atmosphere.js`.

**Tests.** Unit: the atlas request follows the optional-asset pattern and its failure keeps
the procedural fragment; every motion kind maps to a valid cell range. Browser: the atlas
request appears at BALANCED, the reverse-scrub equality still holds, and the phone budget is
unchanged because sprites are not triangles.

Effort: two days.

### A4. Soft sun shadows

**What.** Percentage-closer soft shadows, so the sun's shadow is sharp at the contact and
softens with distance, replacing the uniform blur of `PCFSoftShadowMap`.

**How.** A global patch of `THREE.ShaderChunk.shadowmap_pars_fragment` applied once at
startup in `dist/cinema.js`, before any material compiles. The PCF block inside
`getShadow` is replaced by a blocker search and a Poisson disk filter whose radius grows
with the receiver-to-blocker distance. The disk is rotated by a hash of the world position,
never by time, so the pattern is stable per pixel and scrubbing stays exact. Shadow map
size stays 2048 at HIGH and 4096 at ULTRA. The shadow camera frustum tightens per world:
the city is 170 by 155 units and the landscape's used area is about 260 by 200, so the
fixed 230 unit frustum wastes texels on the city.

**Tiers.** HIGH and ULTRA, the only tiers with shadows.

**Cost.** Roughly two to three times the current PCF taps per shadowed fragment. Shadowed
pixels are the minority of the frame.

**Tests.** Unit: the chunk patch is applied exactly once and the patched chunk contains the
blocker search. Browser: the HIGH probe's reverse-scrub equality covers the hash rotation.

Effort: half a day.

### A5. Hero lights and light shafts

**What.** Make the hero effects light their surroundings, in two parts. First, the point
lights that already exist for impacts, beams and crosses get intensities and decay retuned
under the new grade so facades visibly warm when the fireball is there. Second, a
screen-space light shaft pass keyed to each scene's emitter.

**Light shafts.** The pass thresholds the render buffer for bright pixels, which the hero
emitters already are, and radially blurs them toward the emitter's projected screen position
in three quarter-resolution passes with shrinking step size, then adds the result to the
scene before bloom. Occlusion is inherent: an emitter pixel hidden behind a tower is not
bright, so its shaft is blocked, which is how the beam through the skyline should behave.
The 0.170 `GodRaysShader` addon provides the generate and combine shaders; the mask is the
threshold instead of the addon's depth mask, so no extra prepass.

**Emitters per scene.** From the scene grade: Independence Day the beam origin under the
ship, Deep Impact the strike point until the column fades, Terminator 2 the fireball, War of
the Worlds the nearest heat ray, Knowing the sun's centre, The Day the Earth Stood Still the
sphere, Evangelion the first cross, Dante's Peak the vent, Wandering Earth Jupiter's limb.
Each has a strength envelope of time, so the shaft rises with the beam and dies with it.
Scenes without an emitter run no pass.

**Tiers.** Lights at all tiers. Shafts at HIGH and ULTRA.

**Attribute.** `data-light-shafts` is the emitter id or `none`.

**Tests.** Unit: every emitter in the grade table names a scene id and a world position;
the envelope is zero outside its window. Browser: the HIGH probe on Independence Day at
16 s asserts `data-light-shafts` is `beam`.

Effort: one and a half days.

## Sequencing

| Order | Piece | Why here |
|---|---|---|
| 1 | A0 tooling | every later sheet and probe comes from it |
| 2 | A1 tone mapping and grade | the global look must be settled before lighting is tuned under it |
| 3 | A2 ambient occlusion | provides the depth texture the next two pieces read |
| 4 | A4 soft shadows | small, independent, cheap to revert |
| 5 | A5 hero lights and shafts | tuned against the AO and shadow contrast from 3 and 4 |
| 6 | A3 soft textured particles | touches the most files, so it goes last on a stable base |

Each is one pull request. A1 and A3 are the two that change phones, and only in the film
pass and the atlas; the rest are gated at HIGH.

## Verification per pull request

1. `npm test` with the new syntax check, then `PLAYWRIGHT_CHANNEL=chrome npm run check`.
2. The fifteen-scene ULTRA sheet before and after, at each scene's hero beat.
3. Frame-rate probes on the five heaviest scenes at ULTRA and at HIGH on this Mac; any
   dip below 60 at ULTRA is profiled by disabling the new pass in the built bundle, the
   method that found the crest veil cost in Deep Impact.
4. The phone budget and the reverse-scrub assertions in the browser suite.
5. Codex review threads resolved before merge.

## Risks

- **AgX changes every scene at once.** Mitigated by the translated grade as the starting
  point, the sheet walk, and the fact that A1 is one pull request that can be reverted.
- **GTAO cost at ULTRA in the city.** Mitigated by the 70% resolution at ULTRA, the clip
  box, and the governor. If a scene still cannot hold 60, the pass gets a per-scene switch
  in the grade table before the tier is lowered.
- **The effects layer misses an object.** Symptom: a beam or sphere casts occlusion. The
  unit test lists every additive material in the scene graph and asserts it sits on layer
  1, so a new effect without `markEffect` fails the suite.
- **Particle rewrite regressions across twenty-two kinds.** Mitigated by doing it last, by
  keeping the seed-to-position code untouched (only the fragment changes), and by the
  reverse-scrub equality assertions, which cover every scene at BALANCED.

## Files

| File | Change |
|---|---|
| `dist/volumes.js` | renamed `dist/render-kit.js`; adds `markEffect`, the effects layer constant, the depth-texture uniform for marched volumes |
| `dist/cinema.js` | tier flags for AO, shafts and film; pass wiring; shadow chunk patch; film pass; particle atlas sampling for its three kinds |
| `dist/scene-config.js` | `grade` per scene |
| `dist/simulation.js` | AgX; exposure from the grade; `markEffect` on its effect meshes and points |
| `dist/terrestrial.js`, `dist/cosmic.js` | atlas sampling in `particles()`; `markEffect` on volumes and points |
| `dist/atmosphere.js`, `dist/baked-explosion.js`, `dist/production.js` | `markEffect` on domes, mist, puffs, fire |
| `tools/author-particles.py`, `dist/assets/particle-atlas.webp`, `tools/asset-baseline.json`, `dist/assets/SOURCES.md` | the atlas and its provenance |
| `tools/capture-media.mjs` | fifteen scenes, beats, probes, compare |
| `tests/render-lifecycle.test.mjs`, `tests/scene-contract.test.mjs`, `tests/browser.spec.mjs` | as listed per piece |
| `docs/` | one note per piece, in the pattern of `ultra-4k.md` |

## Effort

| Piece | Days |
|---|---|
| A0 tooling | 0.5 |
| A1 tone mapping and grade | 1.5 |
| A2 ambient occlusion | 1 |
| A4 soft shadows | 0.5 |
| A5 hero lights and shafts | 1.5 |
| A3 soft textured particles | 2 |
| Total | 7 |

## Out of scope, and where it goes

Temporal anti-aliasing, screen-space reflections and global illumination need either
frame history or a renderer with a proper post-processing graph. Both are the subject of
approach C.
