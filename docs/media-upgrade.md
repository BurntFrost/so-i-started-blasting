# Audio and graphics upgrade

All ten scenes now have original ambience and effects synchronized to their
30-second timeline. Click **ENABLE SOUND** below the player, then play a scene.
Sound starts off on every visit. Pause, scrubbing, scene changes, muted volume,
hidden tabs and renderer failures stop active audio. Scene beds resume at the
selected timeline position; scrubbing does not replay past impacts.

The visual pass adds layered cloud ceilings and distant haze, an AI-generated
nebula backdrop, separate planetary cloud shells and rim lighting, brighter wave
foam, billowing nuclear clouds and restrained highlight grading. LITE keeps the
native renderer and a single atmospheric layer. Effects remain reversible.

The audio and graphics upgrade was merged in PR #8 and is included in the
[production cinema](https://soistartedblasting.com/).

## Tools and assets

| Tool | Used for |
|---|---|
| mediactl doctor / capabilities | Verified the installed media toolchain and local model readiness |
| SoX + FFmpeg + FFprobe | Created, mixed, encoded and checked seven original 30-second ambience beds and three effects |
| HyperFrames + local Kokoro | Generated the short original introduction in the generic `bm_george` voice |
| resvg + cwebp | Rendered a seamless storm texture and optimized both deployed textures |
| Built-in imagegen | Generated the nebula bitmap; local ComfyUI startup was attempted but delayed by import I/O and stopped |
| CLAP | Indexed all 11 sounds and checked the initial impact synthesis against an explosion prompt |
| mediactl MLX-VLM / Qwen3-VL | Reviewed the nebula and rendered scene contact sheet |
| Playwright + Chrome DevTools + ImageMagick | Exercised the app, captured desktop/phone views and assembled a visual contact sheet |

The new media adds approximately 3.67 MB to the deployed assets. Audio is fetched
only after sound consent and selected-scene assets load on demand. Every MP3 and
WebP participates in content hashing. No model or generation service runs in the
visitor's browser. The other installed tools were unnecessary for this realtime
scene task.

Source, exact generation prompt and asset provenance:
[SOURCES.md](../dist/assets/SOURCES.md). Rebuild commands:
[tools/README.md](../tools/README.md).

## Verification

The full `npm run check` release gate passed with Node 24.21.0 and installed Chrome:

| Check | Result |
|---|---|
| JavaScript unit/build tests | 38 passed |
| Certificate-tool unit tests | 10 passed; this did not make new live certificate claims |
| Committed media checksums | All 22 passed |
| Production build | 54 fingerprinted assets |
| Browser regressions | 10 passed locally in 20.9 seconds, including all ten scenes at BALANCED and a separate HIGH city probe with pixel-identical reverse scrubbing |
| Audio browser behavior | No MP3 request before consent; play/pause/seek/volume/speed/scene changes and missing-file fallback passed |
| Asset decode | All 11 MP3s decoded, 44.1 kHz stereo; final encoded peaks -12.5 to -6.7 dBFS |
| Additional screenshot capture | Eight scene frames plus a 390px phone layout; no page or shader errors |

Browser checks also cover optional texture failure, WebGL failure/context loss,
fullscreen and phone geometry budgets. They verify behavior on this Mac and do
not establish physical-phone frame rates. AI reviews are qualitative observations,
separate from the technical checks.

Local review artifacts are generated into ignored `work/media-review`:

- [Eight-scene contact sheet](../work/media-review/contact-sheet.jpg)
- [Phone layout](../work/media-review/phone.png)
- [Capture metrics](../work/media-review/capture.json)

The audio authoring source is `tools/author-audio.py`; storm texture source is
`tools/storm-noise.svg`; `tools/capture-media.mjs` reproduces the screenshots.


## Superseded audio

The seven shared beds and three generic effects described above were replaced on
2026-09-13 by one timeline-composed bed per scene and scene-specific cues; see
[film-audio.md](film-audio.md). The consent, playback and scrubbing behavior is unchanged.
