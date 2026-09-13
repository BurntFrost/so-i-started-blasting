# Build, release checks, and graphics assets

## Reproducible deployment

Use Node 24 (the `.node-version`, `.nvmrc`, package engines, GitHub CI, and Vercel
runtime agree), then run:

```sh
npm ci
npm run build
npm run serve
```

The lockfile pins Three.js 0.170.0, the build-only module lexer, and Playwright,
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
npx playwright install --with-deps chromium
npm run check
```

`check` runs Node unit/build tests, certificate-tool Python standard-library tests,
asset checksums, the exact production build, and the committed WebGL browser suite.
The GitHub Actions job is named **quality** for the required merge check; it runs on
pull requests and pushes to main with read-only repository permissions. The browser
revision is tied to the Playwright lockfile and uses software WebGL on CI. Browser
tests cover all ten scenes, reverse scrubbing, paused orbit, fullscreen controls,
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

`asset-baseline.json` records SHA-256 and size for all 22 deployed graphics and audio files.
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

## Original sound and atmospheric textures

The synthesis source is `author-audio.py`; run `python3 tools/author-audio.py` with
the installed SoX and FFmpeg commands to create seven 30-second beds and three
short effects. It uses seeded noise/oscillators, stereo reverb, edge fades and
bounded peak normalization. The existing files were encoded with FFmpeg 9.0.1 to
44.1 kHz stereo MP3 at 128 kbit/s. Exact encoded bytes can vary by tool version;
review regenerated media before updating the asset checksums.

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

After building and starting the server, `node tools/capture-media.mjs` captures
eight scene frames and a phone layout into ignored `work/media-review`. This
uses installed Chrome and reports shader/page errors in `capture.json`.
