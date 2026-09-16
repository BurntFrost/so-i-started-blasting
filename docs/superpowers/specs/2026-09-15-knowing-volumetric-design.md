# Knowing volumetric rebuild (third scene of the graphics upgrade)

Approved scope, 2026-09-15, after Twister and Deep Impact, with ULTRA as the showcase tier.
Knowing is a cosmic scene, so the march generator moved out of `dist/terrestrial.js` into
`dist/volumes.js` and both renderers import it. Twister stays pixel-identical after the move.

## Goal

Stop the sun from clipping to a flat white disc, and replace the corona sprite, the ejection
bubble and the engulfing rim shell with volumes that carry the three beats: a corona that
changes when you orbit, a coronal mass ejection with a bright fibrous front, an empty cavity
and a dense core, and Earth wrapped in a bow shock and a plasma wake.

## Constraints kept

- Every pixel stays a pure function of absolute time; the only per-pixel term is the march
  jitter. Reverse scrubbing remains byte-exact.
- LITE and BALANCED keep the sprites, the bubble and the rim shell. CI runs at BALANCED.
- No new assets. Space has no fog, so the volumes carry none.

## Design

| Element | Before | Now |
|---|---|---|
| Photosphere | HDR range to 3.7 that clipped under ACES and bloom | range to 2.2 with stronger granulation contrast and limb darkening; the flash keeps its core and loses most ray spikes; the chromosphere rims soften |
| Corona | camera-facing sprite | shell volume from the limb to 62 units: radial streamers, a helmet streamer over the active region, fine wisps; thin enough that the disc shows through and the limb glows where chords are long |
| Ejection | additive rim sphere plus 16,000 dot sprites | sphere volume riding the bubble's position and radius: a thin bright front on the Earth-facing side broken into strands, a nearly empty cavity, a dense core of ejected prominence; sprites thinned to a fifth |
| Engulfment | additive turbulent rim | ellipsoid volume around Earth: a bright bow shock on the sun-facing side, a thin fire sheath, a plasma wake behind the planet |

Marches stop inside opaque bodies through the generator's new `stop` condition, so the far
side of the corona never draws over the disc and the shock never draws through Earth.

| Volume | HIGH | ULTRA |
|---|---|---|
| Corona | 20 | 28 |
| Ejection | 32 | 40 |
| Engulfment | 24 | 32 |

## Lessons

The first pass looked worse than the sprites: every volume was far too dense, so bloom turned
the scene into a pale blob. Coronal plasma is thin. Absorption fell by a factor of four to ten,
colours stayed under the bloom threshold except at the front and the shock, and the ejection
only read as a wave once it had a cavity. Tuning took five capture passes.

## Files

- `dist/volumes.js`: `marchedVolume` with `stop`, `setInside`, `volumeFrame`, `volumeUniforms`.
- `dist/terrestrial.js`: imports the module; no other change.
- `dist/cosmic.js`: `createSolar` gains the three volumes and tier gating; the loop passes the
  active quality; sprites carry a `volumetricShare`.
- `tests/render-lifecycle.test.mjs`: tier gating, step budgets and the inside-corona flip.

## Verification

Captures at 1440x960 and device pixel ratio 2 on this Mac at 3, 6, 14 and 25 s; no page or
shader errors; 60 fps at ULTRA from 9 s and from 22 s. Unit, Chromium and WebKit suites
recorded in the pull request.
