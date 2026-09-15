# Cinema environment and surface assets

The HDR environment and texture maps below are CC0 1.0 under Poly Haven's verified asset license: https://polyhaven.com/license

Downloaded 2026-09-13. Every original payload's MD5 matched Poly Haven's public API metadata. The table below records the original downloads. The six JPEG texture maps were converted to the corresponding `.webp` files with ImageMagick at quality 86 for deployment; `dusk.hdr` is unchanged.

| File | Bytes | Source download |
|---|---:|---|
| dusk.hdr | 1526564 | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/the_sky_is_on_fire_1k.hdr |
| concrete-albedo.jpg | 543902 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_diff_1k.jpg |
| concrete-normal.jpg | 114447 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_nor_gl_1k.jpg |
| concrete-roughness.jpg | 215714 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_rough_1k.jpg |
| asphalt-albedo.jpg | 914719 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_asphalt/worn_asphalt_diff_1k.jpg |
| asphalt-normal.jpg | 1503498 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_asphalt/worn_asphalt_nor_gl_1k.jpg |
| asphalt-roughness.jpg | 480395 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_asphalt/worn_asphalt_rough_1k.jpg |

Original image payload: 5,299,239 bytes. Deployed WebP maps plus HDR: 2,792,450 bytes. All texture maps are 1024 x 1024. HDR is 1K Radiance format.

Asset pages:
- The Sky Is On Fire, Greg Zaal (HDRI): https://polyhaven.com/a/the_sky_is_on_fire
- Concrete, Rob Tuytel (4 m tile): https://polyhaven.com/a/concrete
- Worn Asphalt, Amal Kumar (2 m tile): https://polyhaven.com/a/worn_asphalt

API metadata sources:
- https://api.polyhaven.com/files/the_sky_is_on_fire
- https://api.polyhaven.com/files/concrete
- https://api.polyhaven.com/files/worn_asphalt

Three.js integration: albedo uses SRGBColorSpace. Normal and roughness maps use NoColorSpace. Normals are OpenGL +Y convention. Use RepeatWrapping at the physical tile scale and PMREM filtering for the HDR environment. The HDRI includes a seaside promenade; use it for reflected light or a sky hemisphere where ground geometry occludes the lower hemisphere, rather than presenting the lower panorama as a new city model.

## Original media added 2026-09-13 UTC

These additions are separate from the Poly Haven assets above. No film soundtrack
or film recording is included.

| Files | Creation and processing |
|---|---|
| `audio/bed-*.mp3` (fifteen beds, one per scene, 30 seconds each) | Original SoX/FFmpeg synthesis composed against each scene's visual timeline; source `tools/author-audio.py` (2026-09-13 film-signature pass). Oscillators, seeded noise, filters, pitch bends, `aevalsrc` expressions (organ clusters, ticking clocks, sirens, impulse trains) and reverb. `bed-melancholia.mp3` (retired 2026-09-13 with the Melancholia scene) contained an original synthesized rendering of the opening measures of Wagner's Tristan und Isolde Prelude (1859, public domain); `bed-knowing.mp3` uses a low-string figure on the dactylic rhythm of Beethoven's Seventh Symphony, second movement (1812, public domain) with an original melodic line. Peak-normalized to -12 dBFS before MP3 encoding. |
| `audio/<scene>-<event>.mp3` (forty-four transient cues, 2 to 6 seconds) | Original SoX/FFmpeg synthesis from the same script: blasts, thunder, foghorn blasts, heat rays, countdown beeps, collisions, flybys, organ swells. Normalized to -8 to -13 dBFS depending on the event. |
| `audio/intro.mp3` | Local Kokoro through HyperFrames 0.8.36, generic `bm_george` voice at speed 0.9. Text: “A front-row seat to the end of everything.” FFmpeg filtering and -20 LUFS target; 2.987 seconds. |
| `storm-noise.webp` | Original SVG fractal turbulence, seed 90210, four octaves, stitched tiles. Rendered by resvg from `tools/storm-noise.svg` and lossless WebP encoded; 256×256 linear grayscale shader data. |
| `nebula.webp` | Built-in imagegen generation, then local cwebp quality 88 at 1536×768. No reference image. Local Qwen3-VL review confirmed diffuse interstellar dust and an empty dark center. |
| `at-field.webp` (added 2026-09-15) | Original seamless hexagon lattice drawn by `tools/author-at-field.py` with Pillow and NumPy: nine-by-ten pointy-top cells, edges drawn at 8192 px and Lanczos-reduced, a wrapped Gaussian glow so the tile has no seam, then the 4096 render Lanczos-reduced to 1024×1024 and encoded with cwebp quality 90. Linear grayscale mask; the renderer multiplies it into an additive material. |

The 60 MP3 files total 9,918,226 bytes (exact bytes are in `tools/asset-baseline.json`). Both new WebP textures together total
62,480 bytes. The build fingerprints every MP3 and WebP. Tool/model environments
and analysis indexes are not shipped with the site.

The final nebula generation prompt was:

> Use case: stylized-concept. Generate a production-ready background TEXTURE for a cinematic realtime 3D outer-space scene, horizontal 2:1 panorama 1536 by 768 or 2048 by 1024. A very dark interstellar molecular dust field with delicate navy, desaturated teal and warm amber wisps primarily around the outer edges, a broad nearly black unobstructed center. Natural astrophotography feel, fine smoky gas detail, just a few tiny distant stars. The brightest clouds are muted and dim: this image will sit behind a bright black hole or asteroid as subtle depth, not compete with it. No planets, moons, suns, spacecraft, central objects, labels, text, watermarks, borders, lens flare or bright white clouds. Left and right edges should fade naturally into the same near-black navy for panorama wrapping. This image is an original project asset for an interactive apocalypse cinema.

ComfyUI's local Stable Diffusion route was attempted but stopped during unusually
slow Python-import I/O, before any inference. The shipped bitmap came from the
built-in imagegen tool. The local storm texture and audio used the installed CLI
toolchain; no new media package or model was installed.

## Scene pass, 2026-09-13

`audio/bed-day-the-earth-stood-still.mp3` and its four cues (`day-the-earth-stood-still-landing`,
`-visor`, `-swarm`, `-ascent`) replaced the three Melancholia files; the four Day After Tomorrow
files were regenerated with heavier wind. All are original SoX/FFmpeg synthesis from
`tools/author-audio.py`; the theremin-style line is an original melody played on a synthesized
vibrato sine, not a recording or transcription of the 1951 score.

## Scene pass, 2026-09-15

The End of Evangelion scene added `audio/bed-evangelion.mp3` and four cues
(`evangelion-lance`, `-cross`, `-rise`, `-pulse`), all original SoX/FFmpeg synthesis from
`tools/author-audio.py`: the hymn-like string progression and its A-major organ resolution are
an original chord sequence, not a transcription of the film's score or closing song. The same
pass added the A.T. field lattice (`at-field.webp` above and `at-field-4k.webp` below), the
first per-scene ULTRA asset.

## Baked nuclear volume proof, 2026-09-13

`explosion-puff.webp` is an original Blender Cycles volume render from
`tools/bake-explosion.py`: 32 RGBA frames at 256×256, 32 samples per frame,
procedural 4D turbulence, volume scattering/emission, and an AgX display transform.
FFmpeg packs the frames into a single 8×4 WebP atlas (2048×1024, quality 85).
It contains no stock or film footage and uses no downloaded model.

The nuclear scene samples and interpolates these frames over seconds 4–20,
then holds the cooled smoke frame. The existing three-dimensional cloud lobe
positions remain live. Camera-facing smoke cards share the lobe transforms with
the original flame geometry; both are visible early, with the original fireball
at reduced intensity. The flames fade between seconds 10 and 18 as smoke takes over.
This is an artistic volume approximation, not a fluid simulation. The atlas
has fixed baked lighting and cannot reproduce correct volumetric parallax.
The original procedural geometry remains the fallback if the atlas fails.

## ULTRA tier assets, 2026-09-13

These files download only when the renderer's quality ceiling is ULTRA (desktop
displays with a device pixel ratio of 1.5 or more). Phones and 1x desktops keep
the original assets above.

| File | Bytes | Creation and processing |
|---|---:|---|
| `dusk-2k.hdr` | 5996454 | Poly Haven "The Sky Is On Fire" 2K Radiance HDR, CC0 1.0, unchanged. Download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/the_sky_is_on_fire_2k.hdr. MD5 `ca2a97070f1bbac3d35300c245b430da` matched the public API metadata at download time. Serves both the visible sky and the PMREM environment in place of `dusk.hdr`. |
| `nebula-4k.webp` | 99096 | Local Real-ESRGAN x4plus (`realesrgan-ncnn-vulkan`) upscale of the shipped `nebula.webp`. The 1536×768 source was padded with a 96-pixel wrapped strip on each side so the panorama seam survives the upscale, cropped back to 6144×3072, Lanczos-resized to 4096×2048 with ImageMagick, and encoded with `cwebp -q 88 -m 6`. No new generation prompt; the dust field is the same original artwork at higher sampling. |
| `explosion-puff-4k.webp` | 2539662 | Same original Blender Cycles volume as `explosion-puff.webp`, rendered by `tools/bake-explosion.py --size 512`: 32 RGBA frames at 512×512, 32 samples per frame with denoising, packed 8×4 into a 4096×2048 atlas by FFmpeg at WebP quality 85. The shader samples the atlas at the cell size it was built for, so both atlases share one timeline. |
| `at-field-4k.webp` | 348276 | The A.T. field lattice at its native 4096×4096 render from `tools/author-at-field.py` (added 2026-09-15), cwebp quality 90. Requested only by The End of Evangelion when the ceiling is ULTRA; `at-field.webp` is its Lanczos downscale, so both tiers tile the same lattice. |
