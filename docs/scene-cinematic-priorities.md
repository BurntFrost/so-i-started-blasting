# Cinematic refinement priorities

Reviewed on 2026-10-30 against the local build at `http://127.0.0.1:4174/`,
before the new Armageddon cinematic pass. This ranks the likely benefit of a
focused art-direction and animation pass, not film quality or physical accuracy.
Armageddon's position describes that baseline; its new implementation is reviewed
separately and should not be judged from these older images.

Subsequent refinement also addresses Terminator 2, Dante's Peak and The Day After
Tomorrow. This table preserves the original prioritization rather than scoring
those updated scenes from their old captures. See the scene-authoring guide and
`work/scene-authoring/three-scene-cinematic/review.md` for the later work and its
local verification.

The subsequent pass addresses ranks 5–7: The End of Evangelion, Gravity and The
Day the Earth Stood Still. Its review and previews live in
`work/scene-authoring/next-three-cinematic/`. The original baseline table below
is unchanged.

Ranks 8–10, Twister, Deep Impact and The Wandering Earth, now have a further
cinematic pass under `work/scene-authoring/twister-impact-wandering/`. It refines
the storm canopy/funnel, folding coastal wave, and Jupiter ignition/escape.
Its combined review contains renderer, phone, fallback and recorded-playback
evidence. Ranks 11–13, **2012, War of the Worlds and Knowing**, have a subsequent
pass under `work/scene-authoring/quake-tripods-knowing/`: localized fault damage,
staggered tripod attacks and a directed solar eruption. The next unrefined
entries in this original ranking are Interstellar and Independence Day.

All 15 scenes were inspected in actual native WebGPU/HIGH browser captures at
1280 × 800, with title, status and camera controls visible. Each has anticipation,
event and aftermath frames plus its registered hero time where distinct: 60
captures in total. No browser errors occurred during this screening. The
recommendations favor visual hierarchy, coherent lighting/materials, expressive
motion and understandable interaction over additional simulation complexity.
The capture script waited for authored assets and relevant texture/atlas/bake
loads to settle. Recorded states include a ready 2048-pixel explosion atlas for
Terminator 2 and a ready A.T. field texture for Evangelion; those findings do not
come from pending or failed optional media.

| Rank | Scene | Expected benefit | Observed opportunity and focused next step |
| ---: | --- | --- | --- |
| 1 | **Terminator 2** | Very high | The 12-second fireball is small behind the skyline; by 18 seconds there is little dominant cloud, and the aftermath has only a small central remnant. At 8 seconds the visible fireball still carries the “last quiet morning” label. Restore a strong rising mushroom silhouette and an unmistakable flash → pressure front → fallout progression; align labels with the event. Inspect the baked-cloud handoff/visibility before adding detail. |
| 2 | **Dante's Peak** | Very high | The eruption reads as stacked mottled blobs, the foreground surge as separate balls, and the mountains as simple cones. Sculpt a coherent volcano silhouette, unify the plume into a dramatic vertical mass, and layer the advancing surge with light, shadow and atmosphere. |
| 3 | **The Day After Tomorrow** | Very high | Successive frames become a nearly uniform blue-gray veil; the freezing streets and evolving snow lose their visual identity. Reserve a readable foreground landmark, stage a directional storm front, and reveal ice with selective cool highlights rather than more all-over fog. |
| 4 | **Armageddon — baseline** | Very high; selected for this pass | The split is readable, but the small centered asteroid feels like a display model. Peach interior glow and radial cut-face bands weaken the mineral finish. Use closer asymmetric staging, cool rim/warm fracture contrast, richer broken interior forms, and a sharp release followed by weighty separation. |
| 5 | **The End of Evangelion** | High | Huge white crosses and the heavily cropped giant compete with each other and with the title. Keep the deliberate graphic/anime treatment, but choose one dominant silhouette, stagger the reveals, subordinate secondary crosses and protect the UI's contrast. |
| 6 | **Gravity** | High | The small station and its simple detached panels compete with the enormous, busy Earth texture and a fairly uniform field of rocklike debris. Give the station a stronger graphic silhouette and material separation, simplify the background where needed, and choreograph a directional close pass into a legible breakup. |
| 7 | **The Day the Earth Stood Still** | High | The glowing sphere reads clearly, but GORT is tiny in an empty park, while the repeated trees and low haze feel like a set of separate assets. Bring the figure into a stronger composition, use motivated sphere light and stage the swarm as a changing threat with a clear focal path. |
| 8 | **Twister** | High | The funnel has visible stacked bands and blends into the muted green-gray surroundings; its upper mass is cropped during the event. Unify the funnel silhouette, improve backlight/ground contrast, and use debris clusters and variable motion to communicate escalation without a uniform particle storm. |
| 9 | **Deep Impact** | Medium–high | The incoming wave provides a strong event, but the rectangular city island, tall narrow impact column and repetitive foam pattern emphasize a diorama. Reframe the coast, shape the wave crest as the main graphic mass, and vary spray timing and foam scale to build approach and impact. |
| 10 | **The Wandering Earth** | Medium–high | The planet scale and ignition are clear, but broad Jupiter stripes and evenly spiked engine plumes create a diagram-like finish. Give the bands atmospheric depth, organize engine light into readable clusters, and time the ignition so its luminous peak resolves into a distinct aftermath. |
| 11 | **2012** | Medium | The diagonal rupture and collapsing skyline communicate the event. Large faceted rocks, broad dust and the exposed base grid weaken the finish. Preserve the strong diagonal while staging plate collapses in waves, differentiating foreground debris and using dust to reveal rather than blanket the chasm. |
| 12 | **War of the Worlds** | Medium | The tripods already have readable silhouettes and a coherent palette. The three sampled event frames look similar and repeated smoke clusters compete with the legs. Emphasize a lead machine, stagger steps/beam sweeps and selectively reveal the consequences of each attack. |
| 13 | **Knowing** | Medium | The Sun, expanding front and engulfed Earth form a clear progression. Broad cream-colored glow washes out some surface contrast and the surrounding particles are visually even. Shape one flare as the focal gesture, preserve Sun/Earth separation through the peak and let the aftermath settle. |
| 14 | **Interstellar** | Targeted | The black-hole silhouette and warm/cool contrast are already strong. Frames differ mainly in orbiting details while the central composition stays nearly identical. Refine the disk's bands/particle halo and give the orbital journey a clearer progression while keeping the established iconography. |
| 15 | **Independence Day** | Targeted | The ship, skyline, beam and destroyed center already provide a strong focal hierarchy and readable story. Improve the charge/flash contrast and stage the collapse more deliberately; a broad rebuild has less immediate benefit than the scenes above. |

## How to use the ranking

Start with the first three after reviewing the completed Armageddon pass. Establish
an appealing hero composition and a readable three-beat sequence before adding
more assets or effects. Keep the existing player controls and visual language
unless the particular composition requires a small, justified adjustment. Preserve
text contrast and the subject's silhouette on a narrow viewport as part of each
implementation; this screening itself was desktop-only.

The ratings are qualitative estimates, not measured performance or guaranteed
effort. Still-frame findings have direct visual evidence for every scene. Motion
suggestions for scenes without a dedicated playback review are creative proposals
informed by their time-separated frames, not claims of observed stutter or pacing
faults. This document is an opportunity ranking, not release certification.

## Playback screening

Armageddon, Terminator 2 and The Day After Tomorrow each ran from 0 to 30 at the
normal 1× playback rate, with no reduced-motion preference. Each run was recorded
as WebM and sampled at two-second simulation intervals. All 15 chronological
samples per scene were visually inspected. This is a complete timed run with
sampled visual review, not a claim that every video frame was inspected. All
three remained HIGH and reported no page errors. Approximate elapsed capture
times were 30.2, 30.4 and 30.6 seconds, respectively; these are not FPS benchmarks.

- **Armageddon:** the first half changes little beyond slow tumbling; the opening
  then reads as a mechanical separation, with most motion settling by the end.
  Stronger anticipation, a decisive release and continuing independent drift are
  the useful animation changes for the current refinement.
- **Terminator 2:** the orange lobes grow between 8 and 14 seconds and have faded
  by 18, leaving the skyline without a strong cloud focal point. The event label
  mismatch at 8 seconds is directly visible in the full-resolution frame.
- **The Day After Tomorrow:** the dominant progression is gradually increasing
  haze. Snow and freezing changes are difficult to read through the later veil;
  a stronger foreground reveal and differentiated storm beats would add drama.

Visual-composition confidence is high for the stated desktop captures. Animation
confidence is stronger for these three sampled runs and lower for the remaining
scenes, whose motion suggestions require playback review before implementation.

## Evidence

Working evidence is intentionally under the ignored directory
`work/scene-authoring/cinematic-ranking/`:

- `report.json`: actual backend, quality and asset state for every capture.
- `capture.log` and `capture.mjs`: reproducible screening command and script.
- `<scene-id>/at-<second>.png`: full-resolution browser images.
- `<scene-id>/sheet.jpg`: labeled contact sheets; all 15 were visually inspected.
- Armageddon baseline: 6, 16, 18, 24 and 28 seconds.
- `playback-report.json` and `playback.log`: the three timed playback runs.
- `<scene-id>/playback/normal-speed.webm`, `sheet.jpg` and `report.json`: recorded
  playback, viewed chronological samples, actual times and quality states.

The shared review criteria are in
[cinematic quality and interaction](../.agents/skills/blasting-scene-director/references/cinematic-quality.md).
