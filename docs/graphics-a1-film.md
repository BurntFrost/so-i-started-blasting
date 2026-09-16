# A1 tone mapping and film

BALANCED, HIGH and ULTRA render through AgX with a per-scene grade. LITE keeps native antialiasing, ACES and exposure 1.3. Cinema owns exposure on scene updates and quality transitions; `applyEnvironment` no longer resets it.

The current chain is RenderPass → UnrealBloomPass → OutputPass → FXAA → Film. FXAA is unmodified. The separate film ShaderPass operates on display-referred colour, samples opposite radial red/blue offsets, applies saturation and tint, retains the original vignette, adds zero-centred grain and clamps RGB to [0,1]. Alpha is preserved. Grain hashes the physical pixel position and `floor(sceneTime * 24)`; no accumulated frame counters or wall clocks are used.

All fifteen scene configurations carry exposure, bloom strength/radius/threshold, tint, saturation, grain and aberration. Initial exposure is 1.6; bloom ratios, tint and saturation are translated from the preceding scene ladders. Grain is .012 and aberration .0012. Partial factory configs fall back to their catalogue grade, then the default grade. Knowing's photosphere radiance is multiplied by 1.35 on composer tiers and remains 1 on LITE.

Unit contracts cover complete finite grades, tint shape, subtle film bounds, reverse seeks across scene changes and 24 fps grain boundaries. Existing browser screenshot byte-equality assertions remain the GPU determinism check. Visual acceptance requires before/after fifteen-scene contact sheets and the exposure → bloom → tint walk; unit tests alone do not establish visual parity.

## Local evidence (2026-09-16)

Rebased onto the A0 tooling fixes (`b3a7318`). Chrome on this Mac, 1280×800 CSS viewport at device scale 2 (ULTRA). The before set is the A0 baseline capture of the unchanged renderer; the after set is this branch at the same fifteen hero beats, captured with `node tools/capture-media.mjs capture --quality ultra`. Both sets report zero WebGL/shader errors.

**Determinism.** Two A1 captures taken two hours apart from separate builds of the same source are byte-identical in all fifteen PNGs and in the contact sheet, and the browser suite's reverse-scrub byte-equality assertions pass at HIGH and ULTRA, so the grain hash and the grade are pure functions of scene time.

**Compare.** ImageMagick absolute error (distance-weighted, see the A0 note; a full-range change of every pixel would be 4,096,000) and normalized RMSE, before to after:

| Scene | Absolute error | RMSE |
|---|---|---|
| independence-day | 140,754 | 0.051 |
| deep-impact | 140,224 | 0.053 |
| day-after-tomorrow | 82,212 | 0.029 |
| day-the-earth-stood-still | 195,212 | 0.066 |
| terminator-2 | 182,542 | 0.064 |
| 2012 | 168,480 | 0.059 |
| war-of-the-worlds | 222,960 | 0.074 |
| knowing | 161,905 | 0.060 |
| armageddon | 141,377 | 0.051 |
| interstellar | 128,889 | 0.047 |
| twister | 216,307 | 0.070 |
| dantes-peak | 154,284 | 0.052 |
| gravity | 148,623 | 0.057 |
| wandering-earth | 144,828 | 0.050 |
| evangelion | 167,795 | 0.058 |

Every scene moves by a small, similar amount. RMSE runs from .029 (Day After Tomorrow, already desaturated and foggy) to .074 (War of the Worlds), against 1 for black against white, which is the signature of a uniform regrade rather than a broken scene.

**Sheet walk.** Pass one on the fifteen-scene sheets: the midtones of the city, the plain and the sea match the ACES sheet, fire and plasma bloom as before and no more, and no scene shows tint drift. Pass two on full-resolution crops of the five brightest subjects (the Knowing photosphere, Jupiter's disc, the Terminator 2 fireball, the Evangelion crosses, the Independence Day beam): AgX holds each shoulder without clipping, interior detail is retained, and midtones sit a hair lighter, which is the intended exposure 1.6 under AgX's darker mids. The translated grade needed no per-scene change, so the exposure, bloom and tint walk closes at the translated values within its two-pass budget.

**Frame rate.** Probes from 16 s with the two-sample probe (the governor writes one `data-fps` value per three seconds of rendered frames after a three-second cooldown), on the five heaviest scenes:

| Scene, from 16 s | ULTRA samples / final tier | HIGH samples / final tier |
|---|---|---|
| Independence Day | 60, 60 / ULTRA | 60, 60 / HIGH |
| Terminator 2 | 60, 60 / ULTRA | 60, 60 / HIGH |
| Day After Tomorrow | 60, 60 / ULTRA | 60, 60 / HIGH |
| War of the Worlds | 60, 60 / ULTRA | 60, 60 / HIGH |
| Evangelion | 59, 60 / ULTRA | 59, 60 / HIGH |

The extra full-screen film pass costs nothing measurable at either tier, no probe demoted, and nothing dips below 60 at ULTRA, so the spec's profiling rule is not triggered. The A0 note's 46 FPS for War of the Worlds at ULTRA came from the earlier single-sample window, which averaged the three seconds right after play including shader warm-up; it is not comparable to these numbers.

Checks on this tree: 110 unit tests behind the syntax check, 10 certificate tests, asset checksums, the production build, 11 Chromium tests (reverse scrubbing at HIGH and ULTRA, the phone budget, `data-cinematic-look` reported as `graded`) and 3 WebKit tests. Full-resolution captures, the compare set and the probe JSON are under ignored `work/graphics-a1-{final,diff,final-probes}`.

Before, the A0 baseline (see [the A0 note](graphics-a0-tooling.md)):

![All fifteen scenes at ULTRA before A1](graphics-pipeline/a0-before.jpg)

After:

![All fifteen scenes at ULTRA after A1](graphics-pipeline/a1-after.jpg)
