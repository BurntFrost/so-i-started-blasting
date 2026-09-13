# Release operations

Production domain assignment requires `release-quality` for the merged main SHA and `release-artifact` for the exact immutable deployment. GitHub runs the hosted smoke automatically using short-lived OIDC. An operator completes the deployment-specific gate using existing GitHub and Vercel CLI authentication. No Vercel management token or bypass secret is stored in GitHub Actions.

## Delivery contract

1. A push to `main` builds in Vercel and runs GitHub Quality. The main-only `release-quality` job fails unless both Chromium and WebKit jobs succeed, including failure or cancellation. Vercel imports this GitHub check for the merged commit.
2. Vercel emits `vercel.deployment.ready` once the immutable build is available, before production assignment. Release validates the Vercel bot's numeric identity, repository, project, production environment, main branch, and commit ancestry. It executes default-branch workflow code and never checks out a payload PR ref.
3. The workflow obtains short-lived GitHub OIDC. Authenticated HTTPS first checks `/release.json` against the event's deployment ID, URL, SHA, project, and environment. It then checks the entry page, manifest, every hashed asset, and browser startup/scene selection. External browser requests are blocked. Protected browser fetches permit zero redirects, and redirect responses are aborted before credentials can follow them.
4. The workflow writes diagnostic `release-ready` status to `client_payload.git.sha`, which may differ from the dispatch workflow's current main SHA. It uploads `release-ready-{deploymentId}` with bounded test evidence. Successful smoke leaves production held by the separate `release-artifact` Vercel run.
5. The operator command below verifies the successful main workflow, fresh artifact, and Vercel control-plane ID/SHA, then completes only that deployment's pending blocking run and reads the result back. A previous passing run for another deployment cannot authorize this one, even when both builds share a SHA.
6. After both gates pass, Vercel assigns production domains. The success/promoted dispatch triggers unauthenticated probes of both public hosts against the same ID/SHA. Public checks receive no origin credential.

Generated `/release.json` contains five nonsecret identity fields from documented Vercel build variables. Local builds omit it; incomplete Vercel metadata fails before staged publication. HTML and metadata revalidate while content-hashed assets remain immutable. Release artifacts contain bounded JSON and expire after 30 days. They contain no tokens, authenticated response bodies, traces, screenshots, or raw provider API responses.

## Complete a verified deployment

From a reviewed checkout with Node 24, Python 3, and existing authenticated `gh` and `vercel` CLIs, supply the numeric **Release workflow run ID for the ready event**:

```sh
node tools/check-deployment.mjs complete GITHUB_RUN_ID
```

The helper downloads through GitHub and verifies repository, default branch, workflow path, dispatch event, successful conclusion, artifact run ID and workflow SHA, plus the validated sender/action recorded by the trusted workflow. GitHub retains artifacts from earlier attempts, so selection is bounded to the successful attempt's start and completion timestamps; duplicate current-attempt reports fail closed. It requires a browser pass, exact deployment identity, manifest digest, and a test timestamp no older than 30 minutes and within the current attempt. It then verifies Vercel's immutable deployment metadata and exact blocking run before writing success. CLI credentials and signed download URLs are never printed.

The helper reads the nonsecret `VERCEL_RELEASE_CHECK_ID` repository variable with `gh`; a local environment variable can supply the same configured ID. Completed, timed-out, nonblocking, duplicate, or mismatched runs are rejected. Do not replace the command with an unchecked success PATCH. If the 30-minute provider timeout expires, request a fresh deployment/check run and fresh hosted evidence. Rerunning GitHub smoke cannot reopen an expired provider run.

## Live configuration and activation

Project `prj_t9xPKJ22rXL1adwZON1A1FH4pWr6`, team `team_jMtyP7WFqokDZDezN3QVX63o`.

The release operator applied and read back this configuration on September 13, 2026. Configuration alone does not prove the first production workflow; perform activation checks after the code reaches main.

| Control | Configured identity |
| --- | --- |
| Imported GitHub check | `release-quality`, `chk_efbaaae6-425a-41ed-bba1-f828f39685b8`, source `git-provider` / `github` / external name `release-quality` |
| Deployment-specific check | `release-artifact`, `chk_2b21dc3c-76de-48a9-8eae-735fe6f99a63`, source `webhook` |
| Both checks | Production only; requires `build-ready`; blocks `deployment-alias`; timeout 1800 seconds |
| GitHub variable | `VERCEL_RELEASE_CHECK_ID=chk_2b21dc3c-76de-48a9-8eae-735fe6f99a63` |
| GitHub management-token secret | None required or configured by this setup |

`release-ready` is diagnostic, not an imported promotion check. The per-deployment gate enforces fresh artifact evidence instead of trusting cached commit status. Keep automatic production assignment enabled during normal releases; the two checks control assignment.

Project checks use `POST /v2/projects/{projectId}/checks?teamId={teamId}`, or `PATCH /v2/projects/{projectId}/checks/{checkId}?teamId={teamId}` for an existing check. List/read first and update matching IDs. GitHub source is `{"kind":"git-provider","provider":"github","externalCheckName":"release-quality"}`; artifact source is `{"kind":"webhook"}`. Both use the stages, target, and timeout above.

Completion uses `GET /v13/deployments/{id}`, `GET /v2/deployments/{id}/check-runs`, and `PATCH` then `GET /v2/deployments/{id}/check-runs/{runId}`. It selects an existing run and never creates duplicates. Local Vercel CLI authentication grants management access; the origin OIDC token does not.

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
- Observe the next main deployment remain pending until `release-quality` and its own `release-artifact` succeed. A same-SHA rebuild must receive a distinct pending artifact run.
- Match event identity, served metadata, workflow artifact, diagnostic status SHA, and Vercel metadata. Complete the artifact gate with the operator command and verify readback.
- Verify both public hosts serve that identity and anonymous origins remain protected. A failing hosted smoke must leave production on its previous identity.
- Local fixtures prove helper behavior. Actual dispatch/OIDC, gate hold/release, and public identity require provider-backed evidence.

Initial API probe `ckr_614a90c3-ea90-4262-98e2-7a7858399577` on old deployment `dpl_9Dmd3D8zAQbz74hsHcRno9YbUcZa` ran while the check was nonblocking and completed explicitly **failed** with interface-only text. That legacy build lacks release metadata. This proved the API interface, not passing smoke or gate enforcement. The existing project check was subsequently made blocking.

Public probes deliberately fail when another deployment supersedes the event before checking. Inspect the active release rather than accepting a different identity. US-only audience rules can also reject a runner outside that audience; investigate routing instead of weakening policy for CI.

During activation on September 13, 2026, Cloudflare Bot Fight Mode challenged the
GitHub runner's public probes even from the US. Security Events confirmed
`managed_challenge` from `botFight`; the same deployment identity and all seven
delivery checks passed from the operator's Mac. A challenged public workflow is
not proof of an application outage or a passing public probe. Preserve the
audience/bot policy and verify both public hosts from an allowed operator route;
record that evidence separately. OIDC verification of the protected immutable
artifact still runs before production assignment.

## Rollback and recovery

1. Select a retained previous **production** deployment. Record exact ID, immutable URL, SHA, domains, and known-good evidence. Inspect the protected artifact. For legacy builds without release metadata, use control-plane identity and historical evidence, recording that limitation.
2. Use Vercel **Instant Rollback** for that exact deployment. Confirm both public names and record the outgoing deployment ID.
3. Verify identity, entry page, hashed assets, and browser startup through public hosts. Confirm anonymous origin protection. Run certificate checks separately; rollback does not repair DNS, certificates, Cloudflare rules, or credentials.
4. Instant Rollback disables automatic assignment. Keep that hold during investigation. Fix source in a reviewed commit, verify its immutable deployment and both gates, then use **Promote** to recover. Confirm automatic assignment is restored and the next release waits for both gates.
5. Preserve the rollback artifact within retention. Record operator, test time, old/new IDs and SHAs, public results, and assignment state. Do not force-promote routine failing releases.

Public failures do not trigger automatic rollback: choosing an appropriate previous deployment requires operator judgment.

## Interface references

- [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks)
- [Vercel GitHub dispatch](https://vercel.com/docs/git/vercel-for-github#repository-dispatch-events) and [event schema](https://github.com/vercel/repository-dispatch/blob/main/packages/repository-dispatch/src/data/deployment.ts)
- [Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)
- [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [GitHub artifacts API](https://docs.github.com/en/rest/actions/artifacts)
- [Playwright redirect limit](https://playwright.dev/docs/api/class-route#route-fetch-option-max-redirects)
- [Instant Rollback](https://vercel.com/docs/instant-rollback)
