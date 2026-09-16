# Deep Impact volumetric rebuild (second scene of the graphics upgrade)

Approved scope, 2026-09-15, after the Twister pilot: the same treatment for Deep Impact, with
ULTRA as the showcase tier. Deep Impact was one of the two scenes still on the original
renderer; its wave mesh, ocean and comet stay where they are, and a terrestrial factory now
owns the volumes that ride the same timeline.

## Goal

Make the water read as water and give the three beats a subject: a plasma entry trail during
the approach, a water column thrown by the ocean strike at 13 s, and a wave whose crest tears
into spray as it crosses the city from 14 s to 30 s.

## Constraints kept

- Every pixel stays a pure function of absolute time; the only per-pixel term is the march
  jitter, a hash of the pixel position. Reverse scrubbing remains byte-exact.
- LITE and BALANCED never run a march. The water material upgrade applies at every tier but
  costs a few noise lookups per water pixel. CI's Chromium suite runs at BALANCED.
- No new assets, no pipeline change. Deep Impact is not in the phone budget loop, and the
  hulls are hidden below HIGH anyway.

## Design

| Element | Before | Now |
|---|---|---|
| Water material | metallic blue standard material with one noise normal | dielectric, glossy, reflects the sunset HDR; two octaves of flowing normals; deep-to-shallow gradient up the face; turquoise backlight through the thin curl; foam lace and lip band that also roughen the surface; rare foam streaks on the open ocean |
| Ocean level | plane 0.6 below the city plate, plate rim visible | plane meets the city floor; the wave base dips under it |
| Comet trail | additive cone | marched cylinder behind the comet: white-hot sheath into a thin dark smoke tail, noise streaming down the axis at entry speed |
| Strike | additive blast sphere and 12 s of sparks | marched column at the impact point: rises to 190 units by 15.5 s, flares into a capped ejecta curtain with a base surge, lit from inside by the vaporised comet for two seconds, gone by 24 s; sparks stop after four seconds |
| Crest spray | 4,800 dot sprites | a thin, patchy veil marched in a shallow hull riding the lip, blown up and back, plus 45% of the sprites |

`marchedVolume` in `dist/terrestrial.js` is the shared generator introduced here: it takes a
hull geometry, a density field, a span and a shade snippet, and emits the march with the
per-pixel jitter, empty-space skipping and fog. Twister's funnel and wall cloud migrated onto
it with no visible change (18 pixels of 3.8 million differ at 17 s).

Tier switch: `detail === 2` shows the volumes. Step budgets per volume:

| Volume | HIGH | ULTRA |
|---|---|---|
| Entry trail | 24 | 32 |
| Impact column | 28 | 40 |
| Crest spray | 18 | 24 |

## Performance lesson

The first crest veil was a 70-unit fog bank marching three-octave noise and a shadow field
call on every dense sample across a screen-wide hull; ULTRA fell to 38 fps. Probing the built
bundle with each volume disabled put the cost on the veil. The fix was ordering the field
cheapest first with early-outs, single-octave noise, no shadow sample, fewer steps and a
smaller hull. ULTRA holds 60 fps from 19 s and 23 s.

## Files

- `dist/terrestrial.js`: `marchedVolume`, `setInside`, `volumeFrame`; Twister migrated;
  `createTsunami` registered for `deep-impact`.
- `dist/cinema.js`: water shader v3 for the ocean and wave; per-tier spray share; four-second
  sparks for the water strike.
- `dist/simulation.js`: ocean level and wave base.
- `dist/scene-config.js`: `deep-impact` labelled terrestrial.
- `tests/render-lifecycle.test.mjs`: factory registered in the reversibility test; tier gating,
  step budgets and the inside-hull flip for the crest.

## Verification

Captures at 1440x960 and device pixel ratio 2 on this Mac at 8, 13.5, 20 and 27 s, the 14.2 s
strike, the 16.5 s column and a dollied-in view; no page or shader errors; 60 fps at ULTRA.
Unit, Chromium and WebKit suites recorded in the pull request.
