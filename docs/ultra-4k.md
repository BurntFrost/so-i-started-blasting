# ULTRA tier and 4K assets

Every scene is a realtime Three.js render, so its resolution is the canvas size
multiplied by the renderer's pixel ratio. Before this change the HIGH tier capped
that ratio at 1.7, which on a Retina or 4K display rendered fewer pixels than the
screen has. Four fixed-resolution assets would also have looked soft once the
canvas grew: the 1K sky panorama, the 1536×768 nebula backdrop, the 256-pixel
explosion bake, and the fixed sphere tessellation of the planets, sun and black
hole.

## What changed

| Area | Before | Now |
|---|---|---|
| Quality tiers | LITE 1.0, BALANCED 1.25, HIGH 1.7 pixel ratio | Adds ULTRA at native pixel ratio up to 2.0 with a 4096 shadow map |
| Unlock rule | Desktop ceiling HIGH | Desktop displays with device pixel ratio ≥ 1.5 start at ULTRA; the same 38/57 fps governor demotes and promotes it |
| Bloom | Full resolution at HIGH | ULTRA keeps bloom at 60% of native resolution, since it is a blur |
| Sky | `dusk.hdr` 1K | `dusk-2k.hdr` (Poly Haven, CC0) when ULTRA is possible |
| Nebula | `nebula.webp` 1536×768 | `nebula-4k.webp` 4096×2048 when ULTRA is possible |
| Explosion | `explosion-puff.webp` 256 px cells | `explosion-puff-4k.webp` 512 px cells when ULTRA is possible |
| Tessellation | Fixed | Doubled for planet, sun, black hole, fireball and tripod silhouettes when ULTRA is possible |

The canvas exposes `data-quality-ceiling` so modules that build geometry or
request textures once can decide at construction time. Phones, touch desktops
and 1x displays are unchanged and never download the larger assets.

On a 3024×1964 MacBook Pro display, fullscreen ULTRA renders 3024×1964 instead
of 2570×1669. On a 4K monitor scaled to 1920×1080, it renders 3840×2160 instead
of 3264×1836.

## Budget

| Asset | Bytes | Downloaded when |
|---|---:|---|
| `dusk-2k.hdr` | 5,996,454 | ULTRA ceiling, after the first frame, city scenes |
| `nebula-4k.webp` | 99,096 | ULTRA ceiling, first space scene |
| `explosion-puff-4k.webp` | 2,539,662 | ULTRA ceiling, first Terminator 2 selection |

The 4K atlas decodes to 32 MiB of texture memory without mipmaps. The 2K HDR
replaces rather than adds to the 1K download on ULTRA-capable machines.

Surface texture maps stay at 1K: ground and facades are seen at grazing angles
under fog, and 4K versions of all six maps would add roughly 20 MB.

## Rebuilding

Commands for every asset are in [tools/README.md](../tools/README.md); provenance
and checksums are in [dist/assets/SOURCES.md](../dist/assets/SOURCES.md) and
`tools/asset-baseline.json`.

## Verification

Run on this Mac (Apple M5, 3024×1964 Retina display) with Node 24 and installed
Chrome on 2026-09-13. The release-gate stages were run individually because the
Playwright headless-shell download is not present locally; Chromium ran through
`PLAYWRIGHT_CHANNEL=chrome` as documented in `tools/README.md`.

| Check | Result |
|---|---|
| JavaScript unit/build tests | 93 passed, including ULTRA telemetry, atlas selection, and ULTRA city-geometry tests |
| Certificate-tool Python tests | 10 passed |
| Committed asset checksums | 26 passed |
| Production build | 60 fingerprinted assets |
| Chromium browser suite | 11 passed, including the new `deviceScaleFactor: 2` ULTRA probe |
| WebKit browser suite | 3 passed |

The ULTRA probe asserts the tier, pixel ratio 2, canvas backing size equal to
twice the CSS size, the detailed HIGH city geometry, the three 4K asset requests,
exact reverse-scrub equality on the Terminator 2 scene, and demotion to BALANCED
at phone width.

Native-scale captures of eight scenes (`CAPTURE_SCALE=2 node tools/capture-media.mjs`)
rendered 2880×1624 frames with no page or shader errors. Triangle counts at ULTRA
matched HIGH in the city scenes and rose in the tessellated space scenes:

| Scene | HIGH triangles | ULTRA triangles |
|---|---:|---:|
| Independence Day, 16 s | 4,632,093 | 4,632,093 |
| Terminator 2, 12 s | 4,540,405 | 4,547,381 |
| Knowing, 18 s | 36,983 | 115,415 |
| Interstellar, 12 s | 18,979 | 59,923 |

A first ULTRA capture had rendered only the medium city (131,193 triangles)
because the authored-geometry selector compared the tier name to `high`; the
selector now maps ULTRA onto HIGH's geometry and both a unit test and the browser
probe guard it. Frame rates on other hardware are not established by these
checks; the existing FPS governor demotes ULTRA when a machine cannot hold it.
