# Infrastructure contract and recovery

`infrastructure-state.json` records the approved nonsecret contract. This is a
read-only drift check, not an infrastructure deployment system. Changes to desired
state require review alongside their live provider verification.

## Run the check

Use Node 24 with the already authenticated GitHub and Vercel CLIs:

```sh
node tools/check-infrastructure.mjs --cloudflare-snapshot work/cloudflare-state.json
```

Alternatively, provide a narrowly scoped `CLOUDFLARE_API_TOKEN` in the process
environment to read the configured zone directly. Required reads cover zone,
DNS/DNSSEC, settings, custom WAF rules, cache rules, and request-header transform
rules. Do not pass tokens in command arguments or paste them into reports. Existing
Wrangler OAuth was insufficient for these reads; this command does not expand its
permissions or create a replacement credential.

The CLI prints only provider/check names, status, and observation timestamps. It
does not print provider payloads, credential values, or raw errors. Exit codes:
`0` provider-configuration contract matches, `1` drift, `2` unavailable/invalid
evidence. **A green configuration check is not proof of an operational release**:
output always marks release activation unverified because this command does not
inspect artifact-bound check runs. Use the release checks and runbook for that
evidence. Unattended use needs scoped read access, not a saved snapshot.

## Cloudflare snapshot contract

A trusted operator may export a fresh MCP observation to an ignored local file:

```json
{
  "schemaVersion": 1,
  "zoneId": "21f508d4760b9b1b3488bbcaa4098c71",
  "checkedAt": "2026-09-13T14:41:01.291Z",
  "cloudflare": {
    "dnsRecords": [],
    "dnssecStatus": "active",
    "settings": {
      "ssl": "strict", "minTlsVersion": "1.2", "alwaysUseHttps": "on",
      "hsts": { "enabled": true, "maxAge": 63072000, "includeSubdomains": true, "preload": true }
    },
    "wafRules": [], "cacheRules": [], "requestHeaderRules": []
  }
}
```

Populate records with `type,name,content,proxied`. Include **all active rules in
provider order**, with `id,enabled,action,expression`; cache rules also include
`cache`. Request-header rules include `headers`, mapping names to `operation` and,
for set operations, the boolean `valueConfigured`. Never include a header `value`
or expression containing a credential. The checker rejects nonredacted header
objects, wrong-zone snapshots, timestamps older than one hour, and timestamps more
than one minute in the future. It does not authenticate the snapshot's author;
use an operator-created file from a trusted read. Rewriting the timestamp without
re-reading providers is invalid. A snapshot is a point-in-time check, **not
continuous monitoring**; examples above are a schema illustration, not live proof.

## What the contract protects

| Area | Expected behavior |
|---|---|
| GitHub | Main requires the GitHub Actions `quality` check with strict updates and administrator enforcement; force pushes/deletion remain disabled. Only checkout/setup-node/upload-artifact are allowed; full SHA pins are required. |
| Vercel | Correct project/team, Node 24.x, Basic build machine with elastic concurrency off, all-deployment SSO protection and fork protection. Repository `vercel.json` supplies static install/build/output settings. Both named production checks require build-ready, block deployment-alias, and time out after 1,800 seconds. |
| OIDC trusted source | GitHub issuer `https://token.actions.githubusercontent.com`; audience `https://github.com/BurntFrost`; exact repository and `refs/heads/main`; exact `workflow_ref` for `.github/workflows/release.yml@refs/heads/main`; production only. Extra claim keys, identities, issuers, or deployment targets are drift. |
| Cloudflare DNS/TLS | Both public CNAMEs stay proxied to the approved Vercel DNS target; DNSSEC active, Full (strict), TLS 1.2 minimum, HTTPS redirect and two-year HSTS with subdomains/preload. |
| WAF order | `ae1954…` blocks non-US traffic; `005c92…` retains the approved crawler expression; `c21256…` rejects old TLS for the exact hosts; `d274fc…` blocks recursively decoded bypass/share parameters. |
| Cache | `c66e29…` sets cache false for the two public hosts; Vercel owns immutable asset caching. |
| Origin headers | `5337d8…` operates only on HTTPS for the exact public hosts, sets the bypass credential and removes bypass-cookie requests. Only configured-presence is recorded. |

Rule-expression SHA-256 values detect exact expression changes without copying
large expressions into routine output. IDs/actions/order and redacted header
operations are also compared; extra/reordered active rules are drift. Review the
fresh provider expression before deliberately updating its fingerprint. The check
cannot prove that a configured credential is valid; public/protected-origin probes
and certificate checks are separate and remain required.

Vercel's guided **Workflow** field stores the GitHub `workflow` display-name claim;
it is not the workflow file path. Entering `.github/workflows/release.yml` there
does not bind the intended file and caused the initial production OIDC check to
fail. The approved raw/API trust rule uses
`workflow_ref = BurntFrost/so-i-started-blasting/.github/workflows/release.yml@refs/heads/main`.
Preserve that exact claim key and value through supported project configuration
updates; do not replace it with the guided display-name field. The checker records
only redacted trust metadata, never an OIDC token.

## Rotation with overlap

1. Identify the credential's consumers, scopes, owner, expiry, and recovery path
   without copying its value into Git or logs.
2. Create an equally or more narrowly scoped replacement through the provider's
   supported flow while the current credential remains valid. Root/operator owns
   this action; the checker never creates credentials.
3. Install it in the designated secret store/consumer. For the origin bypass,
   update the exact-host HTTPS transform and verify public delivery plus continued
   direct-origin protection. For workflow/API credentials, verify the exact
   approved workflow and target with read-only probes first.
4. Keep the old credential until every consumer and failure/recovery path has been
   checked. If validation fails, restore the old consumer configuration.
5. Revoke the old credential, repeat the probes, and record the nonsecret dates and
   scope/ownership change. Certificate replacement has its own overlap and SAN
   verification procedure in `certificate-operations.md`.

## Recovery boundaries

- **Application release:** choose a previously verified immutable deployment from
  `release-operations.md`; verify its ID/SHA, restore its production assignment,
  and check public rendering/assets and direct-origin protection. A Git revert or
  successful local build alone does not establish rollback.
- **Infrastructure drift:** capture a fresh redacted observation, identify the
  specific changed contract, and restore only that provider setting using the
  provider's supported UI/API. Re-run this checker and public/origin/TLS checks.
  Rolling back application code does not restore DNS, WAF, credentials, SSO,
  certificates, or cache rules.
- **Broken read access:** report unavailable evidence and repair the existing
  operator authentication/scope through the approved process. Do not relax US-only
  access, crawler restrictions, TLS, or origin protection to make a probe green.
- **Release gate:** `release-quality` uses GitHub's named check; `release-artifact`
  uses the configured webhook check. Their configured identities/scope/blocking
  behavior are compared, but operational activation needs evidence from the merged
  workflow against an immutable deployment. A same-SHA rebuild must not reuse stale
  artifact approval.

API references: [GitHub Actions permissions](https://docs.github.com/en/rest/actions/permissions),
[Cloudflare ruleset entry points](https://developers.cloudflare.com/api/resources/rulesets/subresources/phases/methods/get/),
[Vercel REST API](https://vercel.com/docs/rest-api).
