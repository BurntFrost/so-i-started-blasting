# Build, release checks, and graphics assets

## Reproducible deployment

Use Node 24 (the `.node-version`, `.nvmrc`, package engines, GitHub CI, and Vercel
runtime agree), then run:

```sh
npm ci
npm run build
npm run serve
```

The lockfile pins Three.js 0.186.1, the build-only module lexer, and Playwright,
including package integrity. `vendor.mjs` walks the actual imported engine/addon
graph, rewrites package imports to local files, and preserves upstream license
comments. `build.mjs` fingerprints that graph with the application's modules and
assets. The deployment includes `vendor/three/LICENSE` and `vendor/three/VERSION`.
Meshopt's license notice is retained in its decoder module. No engine/addon CDN
request is needed at runtime. Review Three.js upgrades separately with screenshots
and all browser checks; `vendor.mjs` deliberately rejects an unexpected version.

The build writes a complete sibling staging directory before replacing the prior
output. Graph-validation or write failures preserve the last successful output;
the publish rename rolls back if it fails. Builds must run serially for one output
directory. No asset-authoring programs run during Vercel deployment.

## Required release check

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm run check
```

`check` runs Node unit/build tests, certificate-tool Python standard-library tests,
asset checksums, the exact production build, and the committed WebGL browser suite.
The GitHub Actions job is named **quality** for the required merge check; it runs on
pull requests and pushes to main with read-only repository permissions. The browser
revision is tied to the Playwright lockfile and uses software WebGL on CI. Browser
tests cover all fifteen scenes, reverse scrubbing, paused orbit, fullscreen controls,
phone layout, a failed optional asset, module/WebGL startup errors, genuine context
loss, and DNT/GPC telemetry suppression. Failure traces are retained for seven days.
These checks establish functional correctness, not physical-phone frame rates.

For local debugging with installed Chrome, `PLAYWRIGHT_CHANNEL=chrome npm run
test:browser` is available. `TEST_BASE_URL` targets an already running built site;
injected failure tests are intended for a local/preview environment. The source
`dist` needs the build to resolve package imports; serve `build`, not `dist`.

## Graphics asset pipeline

`author-assets.py` is the original Blender source for five architectural templates,
a branching tree, and the mothership. Run with Blender 5.2 in background mode.
It writes editable Blender scenes, GLBs, and statistics to `/tmp/blasting-models`.
The `*-v2.glb` files are the final authored assets.

```sh
blender --background --factory-startup --python tools/author-assets.py
gltf-transform meshopt /tmp/blasting-models/city-kit-v2.glb dist/assets/city-kit.glb --level high
gltf-transform meshopt /tmp/blasting-models/mothership-v2.glb dist/assets/mothership.glb --level high
gltf-transform validate dist/assets/city-kit.glb
gltf-transform validate dist/assets/mothership.glb
```

The versions present when this baseline was verified are **Blender 5.2.1 LTS**
(build 2026-08-25), **glTF Transform 4.5.0**, and **ImageMagick 7.1.2-31 Q16-HDRI
aarch64**, build `8309dc92a:20260903`. These describe the verified local toolchain;
the original asset build did not retain a complete toolchain lock. Rebuilding with
these versions must be visually reviewed before replacing checked-in files.

`asset-baseline.json` records SHA-256 and size for all 83 deployed graphics and audio files.
`npm run assets:verify` checks them without regenerating anything. It is an accurate
baseline of current checked-in bytes, not a claim of byte-for-byte reconstruction
from the original toolchain. When intentionally replacing an asset, verify its
license, validate GLBs, inspect it in the browser, then update that manifest in the
same reviewed change. Blender exporter/compression metadata can vary between
versions even when geometry appears identical.

The runtime registers MeshoptDecoder, expands normalized integer geometry before
baking template transforms, and uses instancing for both detailed and Lite city
geometry. The validator reports no errors or warnings, but does not itself
validate EXT_meshopt_compression; browser loading provides that integration check.

Texture provenance, original download URLs, and CC0 licensing are documented in
`dist/assets/SOURCES.md`. Original JPEGs are not checked in. Download each documented
JPEG into a scratch directory using the table's local filename, then reproduce the
conversion explicitly:

```sh
mkdir -p work/texture-inputs
# Download the six documented source JPEGs into work/texture-inputs first.
magick work/texture-inputs/concrete-albedo.jpg -quality 86 dist/assets/concrete-albedo.webp
magick work/texture-inputs/concrete-normal.jpg -quality 86 dist/assets/concrete-normal.webp
magick work/texture-inputs/concrete-roughness.jpg -quality 86 dist/assets/concrete-roughness.webp
magick work/texture-inputs/asphalt-albedo.jpg -quality 86 dist/assets/asphalt-albedo.webp
magick work/texture-inputs/asphalt-normal.jpg -quality 86 dist/assets/asphalt-normal.webp
magick work/texture-inputs/asphalt-roughness.jpg -quality 86 dist/assets/asphalt-roughness.webp
```

The source files are 1024px; no resize or color-space conversion is applied.
Albedo is sRGB; normal and roughness remain linear. The Radiance HDR supplies
both the sky and the PMREM reflection environment.

No graphics assets require a remote generation service at runtime.

## ULTRA tier assets

Three higher-resolution assets ship beside the originals and are requested only
when the canvas reports `data-quality-ceiling="ultra"` (desktop, device pixel
ratio 1.5 or more). Their provenance is in `dist/assets/SOURCES.md`.

```sh
# 2K sky: verify the MD5 against https://api.polyhaven.com/files/the_sky_is_on_fire before copying
curl -L -o dist/assets/dusk-2k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/the_sky_is_on_fire_2k.hdr

# 4K nebula: wrap-pad the seam, upscale locally, crop, resize, encode
magick dist/assets/nebula.webp -write mpr:src -delete 0 \
  \( mpr:src -gravity East -crop 96x768+0+0 +repage \) \( mpr:src \) \( mpr:src -gravity West -crop 96x768+0+0 +repage \) \
  +append PNG24:work/4k/nebula-padded.png
realesrgan-ncnn-vulkan -i work/4k/nebula-padded.png -o work/4k/nebula-up.png -n realesrgan-x4plus -s 4 \
  -m "$HOME/Library/Application Support/AgentMedia/ncnn/models"
magick work/4k/nebula-up.png -gravity Center -crop 6144x3072+0+0 +repage -filter Lanczos -resize 4096x2048 PNG24:work/4k/nebula-4k.png
cwebp -q 88 -m 6 work/4k/nebula-4k.png -o dist/assets/nebula-4k.webp

# 4K explosion atlas: 32 frames at 512 px, packed 8x4
blender -b -t 8 --python tools/bake-explosion.py -- --frames 32 --size 512
ffmpeg -y -framerate 1 -i work/explosion-bake/frames-512/%03d.png -vf tile=8x4 -frames:v 1 \
  -c:v libwebp -quality 85 -compression_level 6 dist/assets/explosion-puff-4k.webp

# 4K A.T. field lattice for The End of Evangelion: seamless hexagon mask at 4096 px plus its 1024 px Lanczos downscale
python3 tools/author-at-field.py
```

`node tools/capture-media.mjs capture --quality ultra` captures native Retina frames of
all fifteen scenes; `docs/graphics-a0-tooling.md` covers the capture, probe and compare modes.

## Original sound and atmospheric textures

The synthesis source is `author-audio.py`; run `python3 tools/author-audio.py` with the
installed SoX and FFmpeg commands (about fifteen seconds). Pass scene function names (for
example `twister gravity`) to render only those files. It composes fifteen 30-second beds, one
per scene, against each scene's visual timeline, plus forty-four short transient cues
(`<scene>-<event>.mp3`). Layers are SoX oscillators and seeded noise with filters, bends,
tremolo and reverb, and FFmpeg `aevalsrc` expressions for organ clusters, ticking clocks,
sirens, countdown beeps and impulse trains. Beds are peak-normalized to -12 dBFS and cues
to -8 through -13 dBFS, then encoded with FFmpeg to 44.1 kHz stereo MP3 at 128 kbit/s.
Exact encoded bytes can vary by tool version; review regenerated media before updating the
asset checksums. The per-scene design is documented in `docs/film-audio.md`.

The introduction uses the installed local Kokoro route:

```sh
hyperframes tts 'A front-row seat to the end of everything.' --voice bm_george --speed 0.9 --output work/media-audio/intro.wav --json
ffmpeg -i work/media-audio/intro.wav -af 'highpass=f=85,lowpass=f=6500,loudnorm=I=-20:TP=-3:LRA=7,afade=t=in:d=0.03,afade=t=out:st=2.8:d=0.18' -ar 44100 -ac 2 -codec:a libmp3lame -b:a 128k -map_metadata -1 dist/assets/audio/intro.mp3
resvg tools/storm-noise.svg work/storm-noise.png
cwebp -lossless work/storm-noise.png -o dist/assets/storm-noise.webp
```

The nebula is a generated bitmap; its prompt and creation route are recorded in
`dist/assets/SOURCES.md`. `cwebp -q 88 -resize 1536 768 INPUT.png -o
dist/assets/nebula.webp` produces the deployed size. Only final WebP/MP3 assets are
needed at runtime, with literal URLs and transitive content hashes in the build.

After building and starting the server, `node tools/capture-media.mjs capture --quality high`
captures the fifteen scene frames into ignored `work/media-review-high`; `balanced` is the
phone tier and `ultra` renders native Retina pixels. This uses installed Chrome and reports
shader/page errors in `capture.json`.

## Deep Impact animated wave

The wave is a compact Blender mesh with six morph targets and baked normals.
Its matching crest curves keep spray attached while the browser samples the
30-second timeline in either direction. The optional GLB retains the procedural
fallback and uses the existing browser water material.

```sh
blender --background --factory-startup --python tools/author-impact-wave.py -- --render
```

This writes the editable `.blend`, GLB, generation report and preview to
`work/scene-authoring/deep-impact/web-pilot/media/`. Use `-- --output DIR` for
an independent reproduction. Review the exported geometry and animation before
copying `deep-impact-wave.glb` into `dist/assets/` and updating its checksum.
Blender 5.2.3 produced identical exports in two independent processes. The runtime
needs one mesh with identity transforms, UV V=0 at its foot and V=1 at its lip,
position/normal morph targets, and the `waveTimes`/`crestFrames` mesh extras.

## Remaining scenes: web animation rollout

The remaining fourteen scenes follow the Deep Impact approach while retaining
real-time 3D, free camera orbit, the reversible 30-second clock, and adaptive
quality tiers. Authored poses handle broad deformation; rigid transforms,
instancing and shader motion handle articulated subjects, particles and fine
surface detail. Four original GLBs supplement the existing scene geometry:

| Asset | Scene and contents | Triangles | Bytes |
| --- | --- | ---: | ---: |
| `continental-motion.glb` | 2012: `WestCrust`, `EastCrust`, `Chasm`; twelve poses | 5,768 | 983,636 |
| `tornado-motion.glb` | Twister: `Funnel`; thirteen poses | 6,144 | 1,102,952 |
| `knowing-prominence.glb` | Knowing: `Prominence`; three closed strands, eight poses | 3,108 | 345,608 |
| `interstellar-craft.glb` | Interstellar: `SurveyCraft`; static ring craft, five material groups | 4,328 | 194,236 |

Rebuild the terrestrial files with the locked Three.js exporter under Node 24;
this writes directly to `dist/assets/`. The Blender generator writes editable
`.blend` files, exports and a report under
`work/scene-authoring/web-rollout/media/`:

```sh
node tools/author-terrestrial-motion.mjs
blender --background --factory-startup --python tools/author-cosmic-assets.py
```

`author-terrestrial-motion.mjs` samples the original geometry functions in
`dist/terrestrial-motion.js`. `author-cosmic-assets.py` uses Blender 5.2.3 LTS
with seed 77494; two separate Blender processes produced identical GLB bytes.
Pass `-- --output DIR` to retain an independent Blender export. Review those
exports before copying the two cosmic GLBs into `dist/assets/` and updating
`asset-baseline.json`. These additions use no external models, textures, film
frames or other copied film assets.

`dist/baked-motion.js` adopts identity-transform meshes with relative position
and normal morph targets and strictly increasing `motionTimes` node extras.
It preserves each live scene material and refreshes its shader when morph inputs
arrive after the fallback has rendered. It samples nonuniform cubic Hermite weights
from absolute simulation time, with C1-continuous velocity at interior keys. GPU morphing needs no accumulated simulation state; repeated and reverse
seeks select the same pose. The Interstellar craft instead follows its runtime
three-dimensional path at constant scale.

Optional assets load only when their scene is first updated, with the shared
15-second timeout, abort handling and procedural fallback. Completion refreshes
a paused scene without moving the camera. Checksums establish file integrity;
normal-speed playback, reverse scrubbing, orbit, fallback behavior and renderer
performance still require the browser checks and visual review described above.
