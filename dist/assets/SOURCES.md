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
| `audio/alien-drone.mp3`, `ocean-storm.mp3`, `ice-wind.mp3`, `cosmic-drone.mp3`, `seismic-rumble.mp3`, `machine-pulse.mp3`, `solar-roar.mp3` (all under `audio/`) | Original SoX oscillator/noise synthesis, tremolo, filtering and stereo reverb; source: `tools/author-audio.py`. Seven 30-second beds, final peak normalization -12 dBFS before MP3 encoding. |
| `audio/impact.mp3`, `audio/fracture.mp3`, `audio/charge.mp3` | Original SoX synthesis; 4, 2.5 and 5 seconds. Normalized to -8 dBFS (impact) or -12 dBFS, then FFmpeg MP3. |
| `audio/intro.mp3` | Local Kokoro through HyperFrames 0.8.36, generic `bm_george` voice at speed 0.9. Text: “A front-row seat to the end of everything.” FFmpeg filtering and -20 LUFS target; 2.987 seconds. |
| `storm-noise.webp` | Original SVG fractal turbulence, seed 90210, four octaves, stitched tiles. Rendered by resvg from `tools/storm-noise.svg` and lossless WebP encoded; 256×256 linear grayscale shader data. |
| `nebula.webp` | Built-in imagegen generation, then local cwebp quality 88 at 1536×768. No reference image. Local Qwen3-VL review confirmed diffuse interstellar dust and an empty dark center. |

The 11 MP3 files total 3,604,116 bytes. Both new WebP textures together total
62,480 bytes. The build fingerprints every MP3 and WebP. Tool/model environments
and analysis indexes are not shipped with the site.

The final nebula generation prompt was:

> Use case: stylized-concept. Generate a production-ready background TEXTURE for a cinematic realtime 3D outer-space scene, horizontal 2:1 panorama 1536 by 768 or 2048 by 1024. A very dark interstellar molecular dust field with delicate navy, desaturated teal and warm amber wisps primarily around the outer edges, a broad nearly black unobstructed center. Natural astrophotography feel, fine smoky gas detail, just a few tiny distant stars. The brightest clouds are muted and dim: this image will sit behind a bright black hole or asteroid as subtle depth, not compete with it. No planets, moons, suns, spacecraft, central objects, labels, text, watermarks, borders, lens flare or bright white clouds. Left and right edges should fade naturally into the same near-black navy for panorama wrapping. This image is an original project asset for an interactive apocalypse cinema.

ComfyUI's local Stable Diffusion route was attempted but stopped during unusually
slow Python-import I/O, before any inference. The shipped bitmap came from the
built-in imagegen tool. The local storm texture and audio used the installed CLI
toolchain; no new media package or model was installed.
