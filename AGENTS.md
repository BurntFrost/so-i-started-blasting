# So I Started Blasting

Use the repo's ESM JavaScript and Node 24 conventions. `dist/` is editable source;
`build/` is generated. Preserve existing user edits and dependency lockfiles.
Do not commit or deploy unless asked.

For movie-scene creation or refinement, start with
`.agents/skills/blasting-scene-director/SKILL.md`. Its related research, build,
media and verify skills contain the scene-specific contracts and checks.
Use `docs/scene-authoring.md` for invocation examples and the research findings.
Do not load the full scene workflow for unrelated maintenance.

For scene work, prioritize cinematic visual appeal, expressive animation and
polished UI/UX over physical realism. Follow the shared art direction and review
criteria in `.agents/skills/blasting-scene-director/references/cinematic-quality.md`.
Judge normal-speed playback and the visible player interface as well as still
frames and technical tests.

Custom agents live in `.codex/agents/`. Delegate only when the user/session
authorizes it, assign non-overlapping ownership and preserve other workers'
changes. Builds and generated shader/asset registries require a single owner.

Scene agents may use Blender, Unity, and any other installed Mac software that
helps with their assigned work. Routine use of installed tools is authorized;
choose the appropriate tool without asking again merely to use it. Discover
tools with `dev-tools catalog`, verify relevant availability with `dev-tools check`,
and follow `.agents/skills/blasting-scene-director/references/mac-toolchain.md`
for app access, project selection and asset exchange.
