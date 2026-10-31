# Scene brief contract

`brief.json` is an authoring handoff. It is never fetched or executed by the public site. The Node helper validates core integration and timing constraints without adding a runtime dependency. Creative adequacy and source accuracy still require review.

| Field | Meaning |
| --- | --- |
| `version` | `1` |
| `id`, `operation` | Stable slug; `create` requires an unused ID, `refine` an existing one |
| `film.title`, `film.year`, `film.moment` | Version and specific moment; year can be null when unknown, with the ambiguity recorded |
| `film.sources` | Array of `{url, observation}`; empty is permitted for a user-described original interpretation, not an excuse to invent film facts |
| `intent` | One sentence describing what the viewer experiences |
| `world`, `renderer` | `city`/`landscape` with `terrestrial`, or `space` with `cosmic`; `original` is reserved for refining the existing original renderer |
| `duration` | Exactly `30` seconds |
| `signature` | Recognizable visual features; describe visible things rather than film quotations |
| `beats` | Exactly three `{start, end, label, action}` objects, contiguous from 0 to 30; labels map to the three-part player |
| `camera.position`, `camera.target` | Finite XYZ triples with distinct position/target; initial framing, not a camera lock |
| `look.accent`, `look.sky` | Six-digit hex colors; detailed fog/light/grade decisions belong in `scene-config.js` |
| `quality.lite/balanced/high/ultra` | What survives, what is reduced and what improves at each tier |
| `audio.direction`, `audio.cues` | Original bed concept and sorted `{at, description}` cues strictly inside the timeline; every added scene still needs a unique bed |
| `assets` | `{path, provenance, fallback}` for planned local assets; empty when reusing procedural primitives |
| `captureSeconds` | At least one in-range time inside each beat, sorted without duplicates |
| `acceptance` | Concrete visual and interaction requirements; use these in addition to existing tests |
| `assumptions` | Explicit creative interpretations and unresolved limitations |

Initialize with the helper, then replace empty creative fields before validation. `init` can choose `refine` for an existing ID and copy its camera/world/colors. For a new ID it starts with a city/terrestrial setup; change that if the subject belongs in space or landscape.

Apply [cinematic quality and interaction](cinematic-quality.md) using these existing
fields. `intent` should describe the mood and viewer experience; `signature` should
include focal composition, palette and lighting cues; beat actions should describe
pacing as well as positions. Record intentional changes to scale or physics in
`assumptions`. Include observable visual and UX criteria in `acceptance`, such as
the subject remaining distinct from the background, a brief flash revealing the
aftermath, or readable phase text and responsive controls throughout playback.
Technical invariants alone are not a complete creative brief. A valid JSON file
does not establish cinematic quality or enjoyable animation.

For a revision, retain the same brief and edit only the relevant beat, camera, look, quality or audio fields. Note what changed in the review. A “darker” request should normally adjust the existing look/grade; it should not create a new scene ID. Changed event times should update both visuals and sound cues.

The current player's event text switches at 10 and 19 seconds. Creative beats can differ, but the builder must check that displayed labels remain accurate or deliberately implement per-scene UI timing. This JSON does not drive the runtime automatically.

The committed `examples/independence-day-refine.json` is a valid integration example grounded in the current catalogue. It demonstrates a brief, not an already implemented refinement or independent film research.
