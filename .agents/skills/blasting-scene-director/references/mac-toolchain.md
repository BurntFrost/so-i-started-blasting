# Use the installed Mac toolchain

All scene agents may use Blender, Unity, and any other software already installed
on Steve's Mac when it helps complete their assigned work. This includes desktop
apps, command-line tools, local Python environments and connected MCP tools.
Routine use is authorized; do not ask for permission again merely to use an
installed app. Choose tools for the actual scene task and existing file ownership.

## Discover capabilities before choosing a workaround

1. Run `dev-tools catalog`, or read
   `/Users/steve/.local/share/codex-tools/CATALOG.md`. Use it as the starting inventory,
   not an exhaustive allowlist or a guarantee that historical versions are current.
2. Run `dev-tools check` for safe local version/import checks when establishing the
   toolchain. Confirm a specific command with `command -v` and its help/version
   output. Check `/Applications` or the app inventory for desktop software absent
   from the catalog. Check available MCP tools and applicable installed skills.
3. Use an appropriate existing MCP integration or CLI; use desktop UI control when
   needed. A missing MCP connection does not mean an app is unavailable: check its
   CLI/background or desktop route before declaring a blocker.
4. Preserve project runtime pins, lockfiles and isolated environments. Use the
   existing installation before considering a duplicate install or a new service.

## Useful routes

| Software | Use in scene work | Access and handoff |
| --- | --- | --- |
| Blender | Model/rig/animate subjects, simulate and bake effects, author textures, render reference frames | `blender`, background Python, or available `blender_lab` MCP tools; retain `.blend` sources and export tested GLB or baked media for the website |
| Unity | Prototype staging, animation, lighting, particles and effects; inspect imported assets and render references | `unity`, an installed Editor, or available Unity tools; use an explicit project and its matching Editor version |
| Blender → Unity | Exchange authored meshes, armatures and supported animation for iteration | `blender-export-fbx INPUT.blend OUTPUT.fbx`; read the local exchange guide below |
| Creative Python | Procedural textures, geometry data, image analysis and visual tooling | `creative-python` uses the shared creative environment; inspect available libraries before assuming an import |
| Audio tooling | Original sound, speech when requested, analysis, conversion and synchronization | `ai-audio`, `ai-audio-python`, `ffmpeg`, `ffprobe`; follow the existing synthesis pipeline and verify any additional commands it needs |
| Image/video tools | Convert textures, make atlases, inspect captures, encode preview media | Installed tools such as `magick`, `cwebp` and `ffmpeg`; inspect tool support for the intended format |
| Browsers | Inspect the live/reference scene and verify the delivered Three.js result | Installed Chrome, Playwright, DevTools or browser UI tools |
| Other installed software | Any task-relevant authoring, inspection, conversion or analysis capability | Discover it through the catalog, PATH, app inventory or connected tools; the rows above are examples, not a restriction |

## Blender and Unity details

For Blender, read the current scene before editing through MCP and preserve
unrelated open work. Background processing can operate on a saved `.blend` with
explicit input/output paths. The existing Blender Lab listener is manually
started on loopback; do not enable automatic startup or expand its access to fix
discovery. If the listener is unavailable, use the installed CLI where suitable.
For procedural assets, seed both Python randomness and Blender noise explicitly
and compare exports from separate Blender processes. Preserve the authoring script
alongside the recorded Blender version so the geometry can be reproduced.

For Unity, inspect the intended project's `ProjectSettings/ProjectVersion.txt`
and installed Editors before choosing a command. Use an explicit project path
and matching Editor; the `unity-editor-6000.3` wrapper is suitable only for a
matching project. Live CLI operations require the project's existing Pipeline
package and an open Editor. Use the relevant installed Unity skill and current
CLI help when actually operating it. Preserve the project's `Packages` lockfile
and asset `.meta` files. Coordinate a single owner for an open Blender scene or
Unity project, just as for shared repository files.

The local Blender/Unity exchange guide is
`/Users/steve/.local/share/codex-tools/blender-unity/README.md`. The FBX helper reads
a **saved** `.blend`, creates its output directory and refuses to overwrite a
file. Keep Blender source outside Unity's `Assets` directory and put the FBX
inside it. Check scale, axes, materials, textures and animation after import.

## Deliver into this repository

Use these applications as part of the scene-authoring pipeline while keeping the
existing Three.js website as the delivery target. Unity scene files, prefabs,
shaders and simulation state need an explicit export, bake or browser
implementation; do not assume they transfer directly. Confirm installed export
support before choosing an interchange format. For the current site, integrate
GLB geometry and supported textures/audio through its existing asset loaders.
Small authored meshes may instead be exported as a static JavaScript geometry
module, as in `tools/author-armageddon.py`. Treat that module as required source
included by the build, measure its compressed size, and test its topology and
material groups; it does not use the optional GLB loading path.

Keep editable sources and intermediate renders in
`work/scene-authoring/<id>/` or the designated authoring project. Put reviewed
runtime assets in `dist/assets/`, record provenance and conversion commands, and
update intentional checksums. Test imported materials, animation, scale, budgets
and fallbacks in the browser. Baked effects must be driven by the shared absolute
timeline so reverse scrubbing remains deterministic. An attractive Blender or
Unity preview is useful evidence, but the website itself must also pass review.

Report the tools actually used, versions where reproducibility matters, source
project paths, exported files and observed checks. Local health checks establish
command/import availability; they do not establish that an Editor, live bridge,
local model or GPU render session is already running.
