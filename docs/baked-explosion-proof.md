# Baked explosion proof

The Terminator 2 scene now uses a Blender-rendered fire/smoke atlas for its
mushroom-cloud lobes, blended with the original bright flame geometry and
fireball. The buildings, lobe positions, shockwave, embers, and
scene lighting remain live Three.js objects. No Vercel job infrastructure is
needed for this proof: the prepared asset ships through the static build.
The original proof was reviewed locally at http://127.0.0.1:4175; select
Judgment Day. The deployment status of the integrated version is tracked by
the release workflow and its deployment identity, separately from this capture.

## Review artifacts

Generated locally under `work/explosion-bake/review/` (ignored by Git):

- `comparison.png`: matched before/after views at 12 and 22 seconds.
- `comparison.mp4`: three seconds of matched scene playback, timeline 10–13 seconds
  at 12 fps. Both sides use BALANCED at a 1000×740 viewport. HIGH stills above
  provide a separate detailed comparison.
- `before-orbit.png`, `after-orbit.png`: the same one-radian camera orbit.
- `before-phone.png`, `after-phone.png`: a 390×844 CSS-pixel viewport.
- `report.json`: capture times, quality tiers, frame intervals, and runtime checks.

The baseline deliberately blocks only the optional atlas request, preserving
the original procedural geometry and fireball. Both desktop captures use HIGH
quality and the same viewport, timeline, and camera; both narrow captures use
BALANCED. The local capture script asserts exact reverse-scrub PNG equality,
camera movement, lazy loading, and absence of JavaScript/WebGL errors.

## Observed result

The combined version keeps the original patterned flames beneath translucent
baked smoke during ignition. Between 10 and 18 seconds, the flames fade away
and the smoke becomes opaque, with irregular edges and internal shading. The cooled cloud at
22 seconds shows the clearest smoke-detail improvement. This visual assessment
comes from inspecting the rendered app, not from an image-similarity score.

| Measure | Original | Combined |
|---|---:|---:|
| Extra graphics download | 0 | 712,916 bytes (696.2 KiB) |
| Extra decoded texture memory, no mipmaps | 0 | 8 MiB |
| HIGH scene triangles at 12 seconds, including passes | 4,540,261 | 4,540,405 |
| HIGH draw calls at 12 seconds | 174 | 175 |
| HIGH scene triangles at 22 seconds, including passes | 4,539,045 | 4,526,229 |
| BALANCED scene triangles at 10 seconds | 45,421 | 45,529 |
| BALANCED draw calls at 10 seconds | 117 | 118 |
| Narrow-viewport playback median frame interval | 16.7 ms | 16.7 ms |
| Narrow-viewport playback p95 interval | 16.8 ms | 16.8 ms |

Frame intervals were sampled with requestAnimationFrame for four seconds in
desktop Chrome on this Mac. This is a viewport emulation and smoke test, not a
physical-phone benchmark or a GPU-time measurement. Transparent-card overdraw
can still be expensive on mobile hardware. The combined effect adds one draw
call during the hot phase; geometry drops once the flames fade. This is a
visual-quality change, not an established performance improvement.

Validation passed using Node 24.20.0 and desktop Chrome: 40 JavaScript tests,
10 Python certificate tests, 23 asset checksums, the 56-asset production build,
and all 10 browser flows. Browser coverage includes all ten scenes, reverse
scrubbing, quality adaptation, consent-based audio, optional asset failures,
and WebGL failure handling. A separate A/B capture verifies the baked asset's
successful load and the exact original fallback with the request blocked.
The final 1600×504 H.264 comparison clip has 36 frames over three seconds.
`mediactl check` passed decoding and found no black or frozen intervals; the
silent visual comparison has no audio stream. Its report is saved alongside
the review artifacts under `hybrid-media-check/`.

## Implementation and limits

- `tools/bake-explosion.py`: 32 deterministic, independently rendered volume
  frames, 256×256 RGBA, Cycles with 32 samples and denoising. Animated 4D noise
  and a cooling emission curve form the puff; this is not a fluid simulation.
- `dist/baked-explosion.js`: lazy-loads one 2048×1024 WebP atlas on nuclear-scene
  construction. Failed requests retain the original geometry. Successful loads
  wake a paused renderer and add camera-facing smoke planes sharing the original
  lobe instance matrices, so the fire and smoke move together at every quality tier.
  The original fireball remains visible with reduced intensity during ignition.
- Adjacent frames interpolate with premultiplied-alpha math to avoid dark
  transparent fringes. Linear filtering, inset UVs, and disabled mipmaps prevent
  neighboring atlas tiles from bleeding into one another.
- Time maps directly from scene seconds 4–20 to frames 0–31. Later times hold the
  cooled texture while the original 3D cloud motion continues. No video decoder,
  independent playback clock, or replay-triggered asset request is involved.
- Each card has fixed baked lighting and no true volumetric parallax. Dense
  instanced transparent cards are not individually depth-sorted; intersections
  and repeated puff shapes may be visible in close or steep camera views. The
  existing freely orbitable scene is preserved, but this is a bounded proof of
  baked effects, not a physically accurate volume renderer.
- The original spheres supply early flames and the network-failure fallback. Other scenes retain
  their current visuals. Sound and the shared 30-second timeline are unchanged.

## Reproduce

Use an installed Node 24 runtime for the repository commands. No packages or
models need to be installed. Run heavy render and browser jobs sequentially.

```sh
blender -b -t 4 --python tools/bake-explosion.py
# Wait for Blender to finish before packing the complete frame sequence.
ffmpeg -hide_banner -loglevel error -y -framerate 16 \
  -i work/explosion-bake/frames/%03d.png -vf tile=8x4 -frames:v 1 \
  -c:v libwebp -quality 85 -compression_level 6 dist/assets/explosion-puff.webp
# Wait for encoding to finish before building; do not hash a partial output.
npm run build
PORT=4175 npm run serve
# In a second terminal:
TEST_BASE_URL=http://127.0.0.1:4175 node tools/capture-explosion.mjs --motion
```

The atlas checksum is recorded in `tools/asset-baseline.json`. Review regenerated
artwork before intentionally updating it; Blender versions/hardware may change
rendered bytes. Original asset provenance is in `dist/assets/SOURCES.md`.
