# Release operations

Production domain assignment requires the imported `release-quality` GitHub check for the merged main SHA. GitHub runs a hosted smoke against the immutable deployment automatically using short-lived OIDC and records the result as the diagnostic `release-ready` commit status plus an evidence artifact; it does not hold production. No Vercel management token or bypass secret is stored in GitHub Actions, and no manual step stands between a green merge and production.

## Delivery contract

1. A push to `main` builds in Vercel and runs GitHub Quality. The main-only `release-quality` job fails unless both Chromium and WebKit jobs succeed, including failure or cancellation. Vercel imports this GitHub check for the merged commit and assigns production domains once it succeeds.
2. Vercel emits `vercel.deployment.ready` once the immutable build is available, before production assignment. Release validates the Vercel bot's numeric identity, repository, project, production environment, main branch, and commit ancestry. It executes default-branch workflow code and never checks out a payload PR ref.
3. The workflow obtains short-lived GitHub OIDC. Authenticated HTTPS first checks `/release.json` against the event's deployment ID, URL, SHA, project, and environment. It then checks the entry page, manifest, every hashed asset, and browser startup/scene selection, expecting as many scene cards as the deployed catalogue module declares (read as text from the manifest, never the workflow checkout, since a ready dispatch can trail a later main commit). External browser requests are blocked. Protected browser fetches permit zero redirects, and redirect responses are aborted before credentials can follow them.
4. The workflow writes diagnostic `release-ready` status to `client_payload.git.sha`, which may differ from the dispatch workflow's current main SHA. It uploads `release-ready-{deploymentId}` with bounded test evidence. A failing smoke shows as a failed status and a failed workflow run; it does not roll production back or prevent assignment.
5. Release listens only for the ready event; success/promoted events do not trigger public-domain HTTP checks. Public delivery can be inspected on demand with `npm run check:public`.

Generated `/release.json` contains five nonsecret identity fields from documented Vercel build variables. Local builds omit it; incomplete Vercel metadata fails before staged publication. HTML and metadata revalidate while content-hashed assets remain immutable. Release artifacts contain bounded JSON and expire after 30 days. They contain no tokens, authenticated response bodies, traces, screenshots, or raw provider API responses.

## Retired artifact gate (2026-09-13)

Until September 13, 2026 a second blocking Vercel check, `release-artifact` (`chk_2b21dc3c-76de-48a9-8eae-735fe6f99a63`, webhook source), held every production deployment until an operator ran `node tools/check-deployment.mjs complete GITHUB_RUN_ID` within 30 minutes of the hosted smoke evidence. The design kept management credentials out of Actions, but it meant that every merge waited on a person and that a missed window forced a redeploy. The check was deleted from the project, the `VERCEL_RELEASE_CHECK_ID` repository variable was removed, and the operator-completion code and its tests were removed from the helper. `tools/check-deployment.mjs` now only implements the `ready` phase.

To restore a deployment-specific gate, create a blocking webhook check with `POST /v2/projects/{projectId}/checks?teamId={teamId}` (`{"kind":"webhook"}` source, `requires: build-ready`, `blocks: deployment-alias`, production target, 1800-second timeout), and either reinstate the operator flow from the git history before this change or give the release workflow a scoped Vercel token so it can complete the check itself after a passing smoke.

## Live configuration and activation

Project `prj_t9xPKJ22rXL1adwZON1A1FH4pWr6`, team `team_jMtyP7WFqokDZDezN3QVX63o`.

| Control | Configured identity |
| --- | --- |
| Imported GitHub check | `release-quality`, `chk_efbaaae6-425a-41ed-bba1-f828f39685b8`, source `git-provider` / `github` / external name `release-quality`; production only; requires `build-ready`; blocks `deployment-alias`; timeout 1800 seconds |
| GitHub management-token secret | None required or configured by this setup |

`release-ready` is diagnostic, not an imported promotion check. Keep automatic production assignment enabled during normal releases; the imported check controls assignment. Project checks use `POST /v2/projects/{projectId}/checks?teamId={teamId}`, or `PATCH /v2/projects/{projectId}/checks/{checkId}?teamId={teamId}` for an existing check; list/read first and update matching IDs. `npm run infrastructure:verify` compares the live configuration with `docs/infrastructure-state.json`.

### OIDC origin access

Configured in **Settings → Deployment Protection → Trusted Sources → External Services → Add → GitHub Actions**:

| Field | Required value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Audience (`aud`) | `https://github.com/BurntFrost` |
| Repository (`repository`) | `BurntFrost/so-i-started-blasting` |
| Ref (`ref`) | `refs/heads/main` |
| Workflow (`workflow_ref`, Edit raw claims) | `BurntFrost/so-i-started-blasting/.github/workflows/release.yml@refs/heads/main` |
| Applies to environments | Production only |

No Actions environment is used. All claims must match. Header: `x-vercel-trusted-oidc-idp-token`. Only hosted smoke has `id-token: write` and `statuses: write`; other jobs have read-only repository permission. Retain deployment protection and the separate Cloudflare origin credential.

### Activation verification

- Merge the reviewed workflow and metadata generator through required PR checks. Dispatch only starts workflows present on the default branch; a preview cannot prove this production flow.
- Observe the next main deployment remain pending until `release-quality` succeeds, then receive the production domains without any operator action.
- Match event identity, served metadata, workflow artifact, diagnostic status SHA, and Vercel metadata.
- Verify both public hosts serve that identity and anonymous origins remain protected.
- Local fixtures prove helper behavior. Actual dispatch/OIDC and public identity require provider-backed evidence.

Initial API probe `ckr_614a90c3-ea90-4262-98e2-7a7858399577` on old deployment `dpl_9Dmd3D8zAQbz74hsHcRno9YbUcZa` ran while the retired artifact check was nonblocking and completed explicitly **failed** with interface-only text. That legacy build lacks release metadata. This proved the API interface, not passing smoke or gate enforcement.

During activation on September 13, 2026, Cloudflare Bot Fight Mode challenged the
GitHub runner's public probes even from the US. Security Events confirmed
`managed_challenge` from `botFight`; the same deployment identity and all seven
delivery checks passed from the operator's Mac. Automated public-domain HTTP
checks have been removed. Preserve the audience/bot policy and use an allowed
operator route for on-demand public verification. OIDC verification of the
protected immutable artifact still runs after each production build.

## Rollback and recovery

1. Select a retained previous **production** deployment. Record exact ID, immutable URL, SHA, domains, and known-good evidence. Inspect the protected artifact. For legacy builds without release metadata, use control-plane identity and historical evidence, recording that limitation.
2. Use Vercel **Instant Rollback** for that exact deployment. Confirm both public names and record the outgoing deployment ID.
3. Verify identity, entry page, hashed assets, and browser startup through public hosts. Confirm anonymous origin protection. Run certificate checks separately; rollback does not repair DNS, certificates, Cloudflare rules, or credentials.
4. Instant Rollback disables automatic assignment. Keep that hold during investigation. Fix source in a reviewed commit, verify its immutable deployment and the `release-quality` gate, then use **Promote** to recover. Confirm automatic assignment is restored and the next release waits for the gate.
5. Preserve the rollback artifact within retention. Record operator, test time, old/new IDs and SHAs, public results, and assignment state. Do not force-promote routine failing releases.

Public failures and a failing hosted smoke do not trigger automatic rollback: choosing an appropriate previous deployment requires operator judgment.

## Interface references

- [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks)
- [Vercel GitHub dispatch](https://vercel.com/docs/git/vercel-for-github#repository-dispatch-events) and [event schema](https://github.com/vercel/repository-dispatch/blob/main/packages/repository-dispatch/src/data/deployment.ts)
- [Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)
- [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [GitHub artifacts API](https://docs.github.com/en/rest/actions/artifacts)
- [Playwright redirect limit](https://playwright.dev/docs/api/class-route#route-fetch-option-max-redirects)
- [Instant Rollback](https://vercel.com/docs/instant-rollback)
