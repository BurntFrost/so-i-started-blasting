# Production hardening design

Approved direction: Steve requested “Fix all these issues” after reviewing the September 13 architecture review. Preserve the static application and GitHub → Vercel delivery behind Cloudflare.

## Requirements

- Preserve US-only access, existing crawler restrictions, Full (strict) TLS, and protected direct origins/previews.
- Keep Node 24.x, deterministic assets and timeline, procedural fallback, audio consent, DNT/GPC, and URL query/fragment sanitization.
- Resolve mixed origin certificate selection without lowering the 45-day origin or 14-day edge thresholds. Verify repeated served handshakes. If provider-managed selection cannot be changed safely, retain the failure signal and document the concrete provider blocker.
- Establish daily certificate/public health checks and durable failure evidence. Keep notification delivery distinct from merely installing a schedule.
- Bind release smoke evidence to immutable deployment ID and expected SHA. Prevent production promotion before required checks. Probe public delivery after promotion and document/practice safe rollback.
- Record redacted provider desired state and credential rotation/recovery procedures. Reconcile Basic build settings and action policy; no secrets in Git.
- Bound optional graphics loading and reject unsupported dynamic local build references.
- Add focused WebKit startup/audio/lifecycle coverage while retaining Chromium coverage.
- Validate and enforce a compatible CSP, with bounded diagnostics; verify telemetry event delivery/ingestion separately from script delivery.
- Schedule dependency/action maintenance. Independent reviewer approval remains optional because no second maintainer has been established.

## Ownership

Application worker owns graphics loader/build validation and their tests. Release worker owns release scripts and GitHub quality/release workflows. Browser/security worker owns WebKit tests, browser configuration, CSP, and telemetry validation. Root owns provider mutations, operations monitoring, desired-state inventory, documentation integration, package scripts, and final verification.

## Closure

Each finding needs a code/configuration change or current evidence that it is already satisfied, plus a meaningful verification. External provider limitations and unavailable real hardware must be reported explicitly; no assertion of success may replace missing evidence.
