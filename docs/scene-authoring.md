# Movie scene authoring with Codex

Create and refine original interactive 3D movie interpretations by describing the
moment in Codex. This package runs in the repository: Codex edits, builds and
reviews the scene using existing tools. It does not add a prompt box or an AI
backend to the public site.

## Creative direction

The default priority is **cinematic visual appeal and a polished user experience**.
Scenes should have intentional composition, appealing lighting and color,
expressive animation and clear, responsive controls. Agents may stylize scale,
physics, timing and materials to make the movie moment look and feel better.
Realism supports the direction where useful; it is not the default acceptance test.

All five skills and agents use the shared
[cinematic quality guide](../.agents/skills/blasting-scene-director/references/cinematic-quality.md).
Briefs carry art direction and UI criteria in their existing creative fields.
Reviewers judge actual frames and a complete normal-speed playback with the
player interface visible, alongside technical tests. Attractive stills alone do
not prove good motion, and passing tests alone does not prove good visual design.

See [cinematic refinement priorities](scene-cinematic-priorities.md) for an
evidence-based ranking of all 15 scenes using this direction. The ranking records
the baseline before the subsequent Armageddon cinematic refinement, which adds
angular mineral fracture surfaces, asymmetric continuing motion, a brief core
impulse and a quieter backlit Earth. Its local review and recorded normal-speed
playback live under `work/scene-authoring/armageddon/cinematic/`.

The completed Armageddon cinematic pass was checked across native WebGPU, node/WebGL,
classic WebGL, and phone-sized BALANCED/LITE profiles. Final source validation
passed 242 tests with five skips, 78 asset checksums and the 146-asset build.
The local review records exact reverse seeking, controls, a complete recorded
30-second run and the limits of its sampled visual review. The entire release
gate was not repeated for this pass; the earlier unrelated camera-reset failure
is documented below. The final video is
`work/scene-authoring/armageddon/cinematic/playback-final-retry/armageddon-cinematic.mp4`.

The subsequent cinematic pass refines the three highest-ranked scenes: Terminator 2,
Dante's Peak and The Day After Tomorrow. It restores soft smoke through ordinary
material billboards, keeps the nuclear cloud visible into the aftermath, gives
the volcano a framed ash crown and continuous downhill surge, and reveals a
directional freeze across readable architecture. It also adds optional
`phaseTimes` and `cameraMaxDistance` scene configuration so labels and framing
match the authored moment. Existing defaults remain 10/19 seconds and 300 units.
Scene briefs live in `work/scene-authoring/<scene-id>/brief.json`; the combined
review, renderer checks and recorded previews are in
`work/scene-authoring/three-scene-cinematic/`.

This three-scene pass passed all 18 renderer/quality combinations, both smoke
texture failure cases, and three uninterrupted 30-second playback recordings.
Source validation passed 256 tests with five skips, 78 asset checksums, 10
certificate tests and the 146-asset build. The review distinguishes sampled
visual inspection from full-frame-rate viewing, and desktop phone emulation
from physical-device performance. The broader all-scene release gate was not
repeated. Each scene's `playback/preview.mp4` is a local recording of the app.

The next ranked group, The End of Evangelion, Gravity and The Day the Earth Stood
Still, has a separate refinement under `work/scene-authoring/next-three-cinematic/`.
It gives Evangelion a complete giant silhouette and a staged handoff from crosses
to the giant, frames Gravity's structural breakup against a quieter Earth, and
grounds a larger GORT before releasing directed nanite ribbons. The original
audio timings are retained. The work uses ordinary geometry and materials
alongside existing shader programs; no new asset export or dependency is needed.
The local review
records the actual renderer, phone-layout and playback evidence for this group.

This pass passed 18 renderer/quality combinations, the field-texture failure
case, 12 normal/fullscreen layout checks at 320/390 pixels, and the all-scene
offline/reverse-scrub/camera/fullscreen regression. Unit validation passed 271
tests with five skips. All three final 30-second recordings stayed at native
WebGPU/HIGH without reported errors. Visual review uses 89 chronological playback
samples plus precise event frames; it does not certify full-frame-rate smoothness
or physical-phone performance. The full release gate was not repeated.

The following group, Twister, Deep Impact and The Wandering Earth, is reviewed in
`work/scene-authoring/twister-impact-wandering/`. It adds a soft storm canopy and
continuous funnel with staged farm debris, a folding wave across a continuous
coast with compact impact vapor, and layered Jupiter belts with clustered engines,
a surface flare and a distinct escape. Existing sound cues are retained. Twister
reuses the Blender smoke atlas; Deep Impact reuses the procedural particle atlas.
Both expose readiness states and refresh correctly after a delayed load while paused.

This group passed 18 renderer/quality combinations, four forced texture-failure
cases and 12 normal/fullscreen phone-layout cases. The all-scene offline/control
regression passed once; a later run reached the previously documented Evangelion
camera-reset check and failed with 13 changed pixels against the unchanged
four-pixel tolerance. Source validation passed 293 tests with five skips. All
three final normal-speed recordings stayed native WebGPU/HIGH without reported
errors. The independent reviewer inspected 90 chronological playback samples;
this does not certify every video frame or physical-phone performance. The full
release gate was not run. Each scene's `playback/preview.mp4` is a silent local
recording.

## Start here

Open this repository in Codex and use:

```text
Use $blasting-scene-director to create an original 30-second scene inspired by
the asteroid breakup in Armageddon. Keep the major fragments readable on phones,
build on the existing scene, and show me the local preview and verified frames.
```

For an unfamiliar movie, specify the version and moment:

```text
Use $blasting-scene-director to research a new movie scene. Ask me which moment
if the title is ambiguous, then build an original interactive interpretation
with a clear silhouette, three timeline beats, and original sound.
```

Follow-up changes stay in the same workflow:

```text
Use $blasting-scene-director to refine twister: make the funnel narrower, delay
touchdown by two seconds, and reduce debris on phones. Keep the sound aligned.
```

For a brief without implementation:

```text
Use $blasting-scene-research to prepare a scene brief only. Do not modify the app.
```

To explicitly use the agent team:

```text
Use blasting_director and launch the scene agents as needed. Have
blasting_researcher prepare the brief, blasting_builder implement it,
blasting_media create the original sound, and blasting_reviewer verify the
result. Give each worker separate file ownership and serialize integration.
```

## Skills and agents

| Skill | Agent | Output |
| --- | --- | --- |
| `$blasting-scene-director` | `blasting_director` | Brief, coordinated implementation, refinement and final evidence |
| `$blasting-scene-research` | `blasting_researcher` | Sourced moment analysis and feasible visual beats |
| `$blasting-scene-build` | `blasting_builder` | Deterministic 3D scene and complete registry/config/capture integration |
| `$blasting-scene-media` | `blasting_media` | Original sound/assets, provenance, synchronized cues and fallbacks |
| `$blasting-scene-verify` | `blasting_reviewer` | Viewed frames, browser/test evidence and actionable findings |

The files use project-scoped discovery: skills in `.agents/skills/`, standalone
agent TOML files in `.codex/agents/`. Open a fresh Codex chat in this repository if
they are not yet in the current chat's list; the root `AGENTS.md` also points to
the director so its instructions can be read directly. Agent definitions inherit
the parent's model, tools and permissions. They do not install tools or grant
extra access. See the official [skill discovery documentation](https://learn.chatgpt.com/docs/build-skills)
and [custom agent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Installed Mac software

All five skills and agents explicitly support using **Blender, Unity, and any
other installed Mac software** that helps with their assigned work. They discover
tools through `dev-tools catalog`, local health checks, available MCP integrations
and app/CLI discovery. Routine use of installed tools is already authorized.

The shared [Mac toolchain guide](../.agents/skills/blasting-scene-director/references/mac-toolchain.md)
covers Blender modeling/baking, Unity staging/effects, Blender-to-Unity FBX
exchange, creative Python, audio, image/video conversion and browser review. It
also explains explicit Unity project/Editor selection, existing environments,
manual Blender listener setup and exporting assets into the Three.js website.
The software examples are a starting point, not an exhaustive list of tools the
agents may use.

## Brief and factory helper

Run from the repository root:

```sh
node .agents/skills/blasting-scene-director/scripts/scene-brief.mjs init my-movie-moment 'Film title'
node .agents/skills/blasting-scene-director/scripts/scene-brief.mjs validate work/scene-authoring/my-movie-moment/brief.json
```

Initialization writes `brief.json` and a runnable `scene.mjs` factory example to
ignored `work/scene-authoring/<id>/`. Fill the creative fields before validation;
the initial brief deliberately fails until the moment, visible actions, quality
treatment and sound direction are supplied. Existing scene IDs initialize a
refinement with their current world/camera. Existing directories are never
overwritten. The example factory is not registered into the player automatically.

The [brief contract](../.agents/skills/blasting-scene-director/references/brief-contract.md)
defines handoffs between agents. A
[complete example brief](../.agents/skills/blasting-scene-director/examples/independence-day-refine.json)
uses the current Independence Day interpretation. The helper checks IDs, world and
renderer compatibility, three contiguous beats over 30 seconds, camera vectors,
cue times, local asset references and capture coverage. It does not judge film
accuracy or artistic quality.

Useful artifacts for each request are the brief, local preview, beat screenshots
and `review.md` containing changes, commands, findings and skipped checks. Keep
working artifacts in ignored `work/`; move a design into `docs/` only when a
durable checked-in specification is wanted.

## Research findings — 2026-10-30

The [live site](https://soistartedblasting.com/) has fifteen selectable scenes and
a 30-second player with orbit, zoom, replay, timeline scrubbing, speed, graphics
quality and opt-in sound. A live Chrome inspection successfully rendered the
initial city/mothership scene at HIGH. The remote HTML scrape returned the
catalogue but also a graphics-startup fallback; that scraper result is not a
reproduction of a local rendering failure. This initial research did not test
every production scene or establish device performance.

The source confirms these authoring constraints:

| Finding | Consequence for the workflow |
| --- | --- |
| Static app; no runtime generation endpoint | Codex builds locally; a public creator would be separate application work |
| Editable source lives in `dist/` | Edit source, then generate `build/`; never patch hashed output |
| Catalogue/config/factory maps are separate | Every addition needs a stable ID and complete integration |
| Three reusable worlds: city, landscape, space | Start from the nearest existing world instead of replacing the engine |
| Absolute-time updates and seeded geometry | Animation must survive arbitrary and reverse seeks |
| Default node renderer plus classic renderer | Custom GLSL also needs captured/generated TSL and backend checks |
| Separate ordered capture catalogue | Add the scene to `tools/capture-media.mjs`, including a hero timestamp |
| Every scene has a unique local sound bed | A silent geometry prototype is not release-complete |
| Optional media, literal URLs and checksums | Preserve fallbacks, provenance and build fingerprinting |
| Phone tests enforce fewer than 150,000 triangles | Keep the recognizable subject at reduced detail |

The existing `set_apocalypse_scene` browser tool selects and seeks existing scenes;
it does not create them. The checkout's `@typesafe-ai/sdk` addition predates this
work; this package uses no model-provider API or new dependency. The code/lockfile
pin Three.js 0.186.1, while the README's introductory runtime paragraph still says
0.186.0; use the actual pin rather than that prose when developing.

Evidence and implementation pointers:

- [Scene catalogue](../dist/scenes.js), [configuration](../dist/scene-config.js),
  [simulation and browser control tool](../dist/simulation.js).
- [Terrestrial factories](../dist/terrestrial.js), [cosmic factories](../dist/cosmic.js),
  [audio contract tests](../tests/audio.test.mjs).
- [Capture tooling](../tools/capture-media.mjs), [node browser checks](../tests/node-browser.spec.mjs),
  [classic browser checks](../tests/browser.spec.mjs).
- [Detailed repository guide](../.agents/skills/blasting-scene-build/references/repository-guide.md)
  and [verification commands](../.agents/skills/blasting-scene-verify/references/verification.md).

## Validate this authoring package

```sh
node --test tests/scene-authoring.test.mjs
node .agents/skills/blasting-scene-director/scripts/scene-brief.mjs validate .agents/skills/blasting-scene-director/examples/independence-day-refine.json
```

These tests cover malformed briefs, integration/timing mistakes, non-destructive
scaffolding, and deterministic starter transforms across seeks and detail changes.
The new test file is included in the existing `npm test` glob. They do not prove a
new movie scene has been generated, integrated, or visually approved. A real scene
must complete the browser verification workflow; run `npm run check` before
calling its implementation release-ready.

Initial package validation on 2026-10-30, before the Armageddon workflow exercise:

- All five skill folders passed the bundled skill validator; a fresh Codex
  `skills/list` scan reported all five enabled with repository scope and no load
  errors. All five standalone agent files parsed as TOML and resolved their skill
  references. Named agents were not launched in this authoring session.
- `npm test`: 236 passed, 5 skipped, 0 failed. The five skips are the existing
  opt-in GPU tests. The four new authoring tests also passed after the final input
  validation adjustment.
- `npm run build`: succeeded, producing 144 fingerprinted assets.
- A standalone starter-factory browser smoke check used installed Chrome with
  node/WebGL and native WebGPU. Both produced changing frames and exact
  16 → 27 → 16 reverse pixels, with no page/console errors. The WebGPU frame was
  visually inspected. Local evidence is in
  `work/scene-authoring/starter-browser/`.
- Skill/document links, agent-to-skill paths and invocation metadata resolved;
  `git diff --check` passed.

That initial pass validated the authoring package and generic factory. The
subsequent Armageddon refinement below exercises the team against a real scene.

## Armageddon workflow exercise

The first full exercise refined the existing asteroid breakup. Research identified
the two large departing pieces as the key visual event; the old scene only shrank
an intact rock and scattered small fragments. Separate research, build, media and
review workers read the corresponding role definitions and skills. The running
chat exposed generic worker roles, so those workers used the files directly;
this is not evidence that the custom agent names were loaded by that session.

Blender 5.2.3 LTS authored two complementary closed halves with a shared jagged
seam, separate exterior/interior materials and 3,992 total triangles. The browser
animates their absolute-time poses, opens a view of Earth, and reduces secondary
debris on phones while retaining both major halves. Existing sound cues remain
at 13/16/21/24/27 seconds. A visual review found overly orange fracture faces;
the revised material uses the existing rock shader and cools by 22 seconds.

Reproduce the geometry with:

```sh
blender --background --factory-startup --python tools/author-armageddon.py
```

The script writes the runtime source module and saves editable `.blend`, inspection
`.glb`, render and statistics under `work/scene-authoring/armageddon/media/`.
Provenance and measured export sizes are in [SOURCES.md](../dist/assets/SOURCES.md).
The local brief, research, browser frames and detailed review are under
`work/scene-authoring/armageddon/` (ignored working evidence).

The exercise improved the reusable instructions: cosmic factories receive named
quality tiers while terrestrial factories receive numeric detail; Blender noise
needs its own explicit seed; static geometry modules follow the source build
graph; and classic renderer coverage must be selected explicitly in browser
verification. The starter factory accepts both quality contracts.

Final targeted browser verification passed on installed Chrome:

| Profile | Peak scene triangles | Observed checks |
| --- | ---: | --- |
| Native WebGPU HIGH | 42,977 | Seven timeline frames, exact reverse/switch restoration, paused orbit, audio controls |
| Node/WebGL HIGH | 42,977 | Seven frames, exact reverse/switch restoration, paused orbit |
| Classic WebGL HIGH | 32,980 | Seven frames, exact reverse/switch restoration, paused orbit |
| Phone viewport BALANCED | 26,649 | Same timeline/control checks, no horizontal overflow, geometry budget |
| Phone viewport LITE | 20,001 | Same checks after the existing governor reduced quality |

All five profiles reported zero browser errors and graphics warnings. The final
frames were visually inspected; reports and screenshots live in
`work/scene-authoring/armageddon/verified-final/`. Phone checks use desktop browser
viewports; they do not establish physical-device frame rates. Audio verification
covers opt-in requests, cue timing and playback controls; the existing audio was
not changed or subjectively re-reviewed.

The full release workflow was attempted against the final build. Syntax checks,
240 unit tests (five existing opt-in GPU skips), 10 certificate tests, 78 asset
checksums and the 146-asset build passed. Chromium passed 18 of 19 tests; the
all-scenes test reached its Evangelion camera-reset assertion and found 12
changed pixels where the tolerance is four. An isolated, unchanged checkout of
HEAD `28b0c234ab5142b2e8506eff1c80efc5d5a054cc` reproduced the same failure and
pixel count. The assertion was preserved. Because `npm run check` stops there,
the remaining suites were run separately: all 16 node/WebGL tests and all three
WebKit tests passed. The complete release command is therefore not green, despite
the successful scene verification; the existing camera-reset failure is recorded
in `work/scene-authoring/armageddon/release-evidence/`.

A final Armageddon fullscreen check also passed on native WebGPU HIGH: entry,
exit, visible transport controls, seeking, playback and pause. The viewed
`release-evidence/armageddon-fullscreen.png` captures the finished scene at
24 seconds with its timeline and audio controls.


## 2012, War of the Worlds and Knowing cinematic pass

The next refinement addresses ranks 11–13 from the original cinematic ranking.
2012 now has localized collapse waves, lower dust, a buckling/falling freeway,
a darker fault and a surviving background skyline. War of the Worlds emphasizes
one polished lead tripod and staggered heat-ray attacks with persistent damage.
Knowing uses a narrow accelerating ejection, a restrained corona and an engulfment
that clears into a readable aftermath. Existing sound beds and cue times remain.

The local evidence is under `work/scene-authoring/quake-tripods-knowing/`:
`review.md`, `summary.json`, 18 renderer/quality cases, six particle fallback cases,
12 narrow-layout cases and three complete normal-speed recorded previews. The
parent reviewed 90 chronological playback samples and desktop/phone beat frames.
303 unit tests passed (five opt-in GPU skips), as did the final all-scene browser
regression and delayed-font startup check. These are desktop-Chrome and emulated
phone checks; the full release command and physical-device FPS were not tested.

This run also removed a blocking Google Fonts CSS import: optional typography now
loads independently and activates after arrival. The scene remains usable while
the font service is unavailable. The reviewed captures use the system fallback.

Subagents were launched but returned no reviewable handoffs in this run; the
parent completed the implementation and verification using the updated skills.
No independent agent review or new Blender/Unity asset work is claimed. Nothing
was committed or deployed.
