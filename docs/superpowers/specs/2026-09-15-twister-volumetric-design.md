# Twister volumetric rebuild (pilot for the graphics upgrade)

Approved scope, 2026-09-15: transform one scene end to end before committing to the
anthology-wide pipeline pass. Twister was chosen because its subject is a volume and it
was the weakest frame in the fifteen-scene ULTRA capture.

## Goal

Replace the two-shell mesh funnel, the sphere-cluster wall cloud and the dot-sprite dust
with rendering that reads as an F5 wedge: a dark, dense, rotating condensation funnel,
a boiling debris bowl, a lumpy wall cloud lit from inside by the strikes, debris that
streaks with its own speed, rain under the ceiling, and a plain that leans into the inflow.

## Constraints kept

- Every pixel stays a pure function of absolute time. The march samples closed-form
  fields; its only per-pixel offset is a hash of the pixel position, so reverse
  scrubbing remains byte-exact and the existing browser assertions hold.
- Phones keep the mesh funnel. LITE and BALANCED never run the march, so the 150,000
  triangle budget at 390x844 is unchanged apart from a few thousand triangles of
  instanced debris and rain.
- No new assets. Everything is procedural, so the checksum manifest is untouched.
- No pipeline change. Tone mapping, bloom, FXAA, shadows and the composer are as before;
  the volumes are ordinary transparent meshes drawn after the opaque scene.

## Design

| Element | Before | Now |
|---|---|---|
| Funnel | two open cylinders, one patched standard material | tight hull mesh whose fragment shader marches a density field: radius profile, helical fbm bands, ragged edge, three suction vortices near the base, single-sample self-shadow toward the sun, sky ambient by height, scene fog by distance |
| Debris bowl | 24 instanced spheres | part of the same field: rotating lobes set both the dome height and the reach; dust albedo sits in the funnel's shadow |
| Wall cloud | 40 billowing spheres | flat hull marched with a lumpy, sagging underside; the active strike brightens the cloud around its origin |
| Debris | 140 planks | planks plus roof panels, limbs and clods on the same spiral, each aligned to its velocity sampled 40 ms ahead and stretched with speed |
| Rain | none | 900 instanced streaks in a ring under the ceiling, slanted into the inflow |
| Plain | flat meadow | tree groups lean toward the funnel and restore on leave; countryside scenes plough part of the meadow into darker crop rows |
| Dust sprites | 1,500 pale puffs | 1,000 darker vortex puffs and 1,200 inflow streams, capped smaller |

Tier switch: `detail === 2` (HIGH and ULTRA) shows the volumes; ULTRA marches 48 funnel
steps and 18 wall steps, HIGH 32 and 14. The hulls are drawn with front faces and the depth
test, so the farm and the trees occlude them. When the camera enters a hull the material
flips to its back faces and the march starts at the camera, updated every rendered frame
through the new `updateView` hook so orbiting with a paused timeline stays correct.

## Files

- `dist/terrestrial.js`: `createTornado` rebuilt; `strike` reports the active bolt;
  the update loop passes the scene configuration and exposes `updateView`.
- `dist/simulation.js`: passes the camera to the terrestrial renderer and calls its view hook.
- `dist/production.js`: lawn shader gains crop plots for Twister and Dante's Peak.
- `tests/render-lifecycle.test.mjs`: tier gating, inside-hull face flip, tree lean and
  restoration, and the grass field never leaving the ground.

## Verification

Captures at 1440x960 and device pixel ratio 2 on this Mac: 10 s touchdown, 17 s farm hit,
22 s full wedge, 28 s rope-out, the 16.7 s strike, and a dollied-in view inside the funnel.
No page or shader errors; 60 fps at ULTRA while playing. Unit, Chromium and WebKit suites
recorded in the pull request.

## Out of scope, deliberately

Ambient occlusion, AgX tone mapping and the shared soft-particle rewrite are pipeline-wide
and are judged separately after this pilot.
