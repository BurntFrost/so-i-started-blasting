---
name: blasting-scene-director
description: Create or refine an original movie-inspired interactive 3D scene in So I Started Blasting, from a plain-language idea through implementation and browser review.
---

# Scene director

Use this as the single entry point for scene creation in this repository. Deliver a working local scene and evidence when the user asks to build; deliver only a brief when asked to plan. These are Codex authoring workflows, not a runtime prompt-to-scene API.

Read [cinematic quality and interaction](references/cinematic-quality.md). Prioritize appealing movie visuals, expressive animation and a polished user experience over realism. Set the scene's composition, palette, lighting and pacing before choosing simulation complexity; allow deliberate stylization of scale, motion and materials. Carry visual and UI acceptance criteria into every worker handoff.

You and the scene agents may use **Blender, Unity, and any other installed Mac software** for assigned work. Read [the Mac toolchain guide](references/mac-toolchain.md), discover available capabilities, and select the best authoring/rendering/export route. Include tool and source-project ownership in handoffs; routine use of installed tools is already authorized.

## Start with the user's intent

- Read the current catalogue in `dist/scenes.js`, the working-tree status, and [the repository guide](../blasting-scene-build/references/repository-guide.md).
- Identify the film/version, moment, and desired change. Ask a focused question if an ambiguous movie or moment would produce a materially different scene. Otherwise state a reasonable interpretation and continue.
- Existing film plus a tweak means refine its stable ID. A separately requested variation gets a new ID; do not replace another scene or silently grow the catalogue.
- Default to an original 30-second, orbitable 3D interpretation. Translate the moment into a recognizable subject, compelling composition, atmosphere and three expressive beats. Use available geometry and assets when they meet the visual direction; choose additional authoring tools when they improve the result.

## Build the handoff

Use `$blasting-scene-research` for unfamiliar film details or supplied references. Create `work/scene-authoring/<id>/brief.json` with the helper:

```sh
node .agents/skills/blasting-scene-director/scripts/scene-brief.mjs init SCENE_ID 'Film title'
```

The helper refuses to overwrite work, creates an intentionally incomplete brief and a working factory example, and does not edit the application. Complete the brief using [the brief contract](references/brief-contract.md), then run:

```sh
node .agents/skills/blasting-scene-director/scripts/scene-brief.mjs validate work/scene-authoring/SCENE_ID/brief.json
```

Briefs live in ignored `work/`; if a durable checked-in design is requested, put it under `docs/` and pass that explicit path to collaborators. A valid brief is a handoff, not proof that a scene renders.

## Coordinate the work

Use these skills directly, or delegate when the user/session authorizes subagents:

| Agent | Skill | Responsibility |
| --- | --- | --- |
| `blasting_researcher` | `$blasting-scene-research` | Film evidence, visual signatures, brief recommendations |
| `blasting_builder` | `$blasting-scene-build` | Scene geometry, timeline, catalogue/config and capture integration |
| `blasting_media` | `$blasting-scene-media` | Original assets, sound synthesis, provenance and asset checksums |
| `blasting_reviewer` | `$blasting-scene-verify` | Test results, screenshots, reversibility and visual findings |

Give each delegated task the brief path, exact owned files, acceptance criteria, and expected output. Tell workers they share the checkout and must preserve others' edits. Research precedes implementation; verification follows integration. Asset creation can run alongside geometry only with non-overlapping ownership. Serialize builds, generated shader registries, `dist/audio.js`, asset manifests, and shared scene files. If named agents are unavailable in the current chat, use the corresponding skill yourself or, when delegation is authorized, give an available worker the role's `.codex/agents/` file and skill to read. Report which route actually ran; do not claim a named agent was loaded when only its instructions were used.

## Iterate from feedback

For requests like “make it darker,” “delay the impact,” or “less debris on phones,” change the relevant brief fields and the smallest owning code. Retain stable IDs, seed, unrelated beats, and assets. Keep soundtrack cues aligned when event timing changes. Record the requested change and verification in `work/scene-authoring/<id>/review.md`.

Use `$blasting-scene-build`, then `$blasting-scene-media` as needed, and finish with `$blasting-scene-verify`. Continue fixes within the authorized scope. Report the preview URL, brief, changed files, viewed frames, observed normal-speed playback, passing checks, and explicit untested items. Assess cinematic appeal and interaction quality separately from technical correctness. Commit and deploy only when requested.

## Gotchas

- A movie name alone may match an existing scene: refine or clarify before adding a duplicate.
- Browser `set_apocalypse_scene` selects and seeks existing scenes; it cannot author new ones.
- A silent geometry prototype is useful, but the current release tests require a unique local sound bed for each catalogue scene.
