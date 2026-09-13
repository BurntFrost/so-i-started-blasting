# Production Hardening Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review each owned task. Root coordinates shared files and provider mutations.

**Goal:** Close the architecture review's application, release, security, and operational findings with verified changes.

**Architecture:** Keep Cloudflare as audience-policy owner and Vercel as protected static origin/cache owner. Keep the existing application/build modules. Add bounded checks and explicit operating contracts at their boundaries.

**Tech Stack:** JavaScript ES modules, Python standard library, Three.js, Playwright, GitHub Actions, Cloudflare and Vercel APIs.

**Spec:** `docs/superpowers/specs/2026-09-13-production-hardening-design.md`

## Global Constraints

- Node 24.x; use `npx --yes --package=node@24 -c '<command>'` locally.
- Preserve US-only/crawler rules, Full (strict), origin protection, 45/14-day certificate thresholds, consent and privacy behavior.
- No provider credentials in output, source, artifacts, or workflow logs. Query metadata through field allowlists.
- Work only in `/Users/steve/Code/so-i-started-blasting/work/architecture-hardening` on `codex/architecture-hardening`.
- Independent file ownership; root alone commits and changes shared provider settings.

### Task 1: Bound graphics loading and enforce build references

**Files:** `dist/production.js`, a focused asset-loading helper if necessary, `tools/build.mjs`, `tests/build.test.mjs`, focused loader tests.

**Interfaces:** Preserve `createProduction(world)` and the existing build entry point; a stalled loader must settle as a failed optional asset without reviving disposed results.

- [ ] Add a test with a never-resolving loader and verify it fails with the current unbounded implementation.
- [ ] Add bounded completion (15 seconds by default, test clock/deadline configurable at the narrow helper boundary). Dispose resources arriving after timeout.
- [ ] Add rejected-input fixtures: `` `/assets/${name}` ``, `'/assets/' + name + '.mp3'`, and `import('./' + name + '.js')`; preserve valid external/data/provider paths.
- [ ] Reject unsupported expressions before extension filtering; preserve the last successful output on failure.
- [ ] Run `node --test tests/build.test.mjs` and the loader tests under Node 24; report commands and outcomes for independent review.

### Task 2: Bind hosted checks to releases

**Files:** `.github/workflows/quality.yml`, `.github/workflows/release.yml`, `tools/check-deployment.mjs`, its tests, `docs/release-operations.md`.

**Interfaces:** Smoke tool consumes an immutable deployment URL/ID and expected SHA, validates metadata before browser/HTTP checks, and emits only bounded status fields. Provider secrets enter only through environment/CLI auth, never artifact URLs.

- [ ] Inspect current Vercel checks/promotion APIs and select a supported gate that waits for a uniquely named main-SHA check.
- [ ] Add tests for mismatched SHA, mismatched deployment identity, unsuccessful build, missing hashed asset, and protected-origin failure.
- [ ] Implement a minimal hosted smoke command; use a bounded authenticated preview check before promotion and public check afterward.
- [ ] Configure release workflow permissions minimally; no privileged fork execution and no untrusted PR checkout with secrets.
- [ ] Keep existing Chromium quality job name stable for branch protection; coordinate the WebKit command with Task 3.
- [ ] Document rollback target selection, immutable identity, public/origin verification, and restoration of automatic assignment after rollback.
- [ ] Root applies the corresponding live gate only after workflow/configuration is reviewable and testable.

### Task 3: Validate browser security and telemetry

**Files:** `playwright.config.mjs`, `tests/webkit.spec.mjs`, `vercel.json`, focused CSP/analytics tests and supporting browser validation script if required.

**Interfaces:** Keep existing Chromium tests unchanged in meaning. Add a separate named WebKit project/command that Task 2 can call. Root owns `package.json`.

- [ ] Inspect public Cloudflare-injected scripts and determine the smallest enforceable CSP preserving the current user flow.
- [ ] Add WebKit smoke cases for initialization, sound opt-in, pause/resume, scene change, and page restoration.
- [ ] Verify DNT/GPC suppression and URL sanitization remain intact; diagnose actual Speed Insights event delivery separately from a 200 script response.
- [ ] Propose and validate enforced CSP against local and hosted responses, retaining bounded diagnostics without adding a general backend.
- [ ] Run focused WebKit/CSP tests. Report real-device availability separately; do not describe emulation as real iPhone validation.

### Task 4: Repair certificate selection and provider desired state

**Files:** `docs/certificate-operations.md`, `docs/infrastructure-state.json`, `docs/infrastructure-operations.md`, `tools/check-infrastructure.mjs` and focused tests as needed.

**Interfaces:** Read-only state checker compares redacted expected values; all credentials are passed at runtime. Certificate checker keeps its existing JSON/exit contract.

- [ ] Re-run `python3 tools/check-certificates.py --repeats 5` and inspect exact matching Vercel certificate SANs/IDs/expiry metadata.
- [ ] Follow the existing DNS challenge/replacement procedure only if new issuance is needed. Retire an overlapping old certificate only after replacement coverage and project ownership are proven; retain provider-managed certificates if removal is refused.
- [ ] Verify repeated origin TLS and public/protected paths after each successful change.
- [ ] Read current project build settings and patch to Basic with bounded concurrency; verify live state matches documentation.
- [ ] Record Cloudflare DNS/WAF/cache/header and Vercel protection/build/gate settings without secret values. Implement drift checks for the nonsecret contract.
- [ ] Document overlap-first credential rotation, rollback, and a provider escalation package if selection cannot be repaired through supported APIs.

### Task 5: Install operations and maintenance controls

**Files:** `.github/workflows/operations.yml`, `.github/dependabot.yml`, `tools/check-public.mjs`, focused tests, certificate/infrastructure runbooks.

**Interfaces:** Operations job runs certificate + public checks with bounded timeouts and durable failure artifacts; no deployment credentials required for TLS/public probes.

- [ ] Add daily scheduled and manual operation checks; fail on TLS threshold, wrong public response, asset failure, or unprotected direct origin.
- [ ] Validate success and a deliberate fixture failure path without sending unsolicited messages to other people. Verify available notification configuration and document any unverified delivery.
- [ ] Add weekly grouped npm and GitHub Actions updates, avoiding automatic major Three.js upgrades that conflict with explicit vendoring.
- [ ] Restrict allowed GitHub actions to the current necessary set and enforce full SHA pins through the supported repository API.
- [ ] Verify workflow YAML, permissions, policies, and zero secret leakage in reports.

### Task 6: Review, release, and close findings

**Files:** Integrate `package.json` scripts, README, and a closure report in `work/`.

- [ ] Independently review each task and fix actionable findings.
- [ ] Run the full Node/Python/build/Chromium release gate once integrated, plus focused WebKit and operational checks.
- [ ] Commit coherent changes, push the branch, and create a reviewable PR with exact validation evidence.
- [ ] Verify exact pushed SHA CI and protected preview; apply/test supported provider controls against that artifact.
- [ ] Complete authorized production rollout/operations activation within branch protections, or surface the concrete remaining approval/provider blocker without claiming those parts are active.
- [ ] Report each original finding as closed or explicitly blocked with evidence and next action. Preserve evidence through compaction in the task ledger.
