# Certificate operations

**Operator: Steve. Vercel origin renewal lead: 45 days. Cloudflare managed-edge alert lead: 14 days.** Check the served Cloudflare edge and Vercel origin certificates at least daily. A failing check needs investigation; renew the Vercel origin before any served origin certificate drops below the lead threshold. Vercel's inventory alone does not prove which certificate an edge serves.

## Read-only verification

From the repository root, using Python 3.11 or newer with a working OS/Python CA trust store:

```sh
python3 tools/check-certificates.py
```

The script resolves the current project-specific Vercel target `cb08fa2577a82a5a.vercel-dns-016.com`, connects directly to every resolved IPv4 origin address, and uses each public hostname as TLS SNI and the verification hostname. It also checks both public Cloudflare hostnames. Each address receives three fresh verified TLS handshakes. Identical results are grouped with a `samples` count; different expiries remain separate. No origin credential or HTTP authentication is needed for a TLS handshake.

JSON includes `host`, `target`, `address`, `notAfter`, `daysRemaining`, `ok`, and any bounded error code. Exit status is **0 only when every sample passes**, or **1** for DNS/connection/TLS/hostname failures, origin certificates with fewer than 45 days remaining, or Cloudflare edge certificates with fewer than 14 days remaining. Local CA trust or connectivity problems also fail the check and must be distinguished from service failures. Never disable certificate verification to obtain a passing result.

Cloudflare Universal SSL normally starts automatic renewal 30 days before expiry. Its separate 14-day alert gives managed renewal time to complete and avoids treating the normal 30–45-day certificate age as a failure. If the edge alert fires, inspect its active/renewal status and escalate persistent failure; do not disable Universal SSL to force renewal or remove the active edge certificate. This differs from the manually recoverable Vercel origin. See [Cloudflare's validity and renewal policy](https://developers.cloudflare.com/ssl/reference/certificate-validity-periods/).

Useful variations:

```sh
python3 tools/check-certificates.py --origin-only --repeats 5
python3 tools/check-certificates.py --min-days 60
python3 tools/check-certificates.py --edge-min-days 21
python3 tools/check-certificates.py --family ipv6
```

IPv4 is the default because the runner may not have IPv6 connectivity. Run the IPv6 variant from a connected runner to cover that path. `--family any` checks every resolved family and fails unreachable addresses. A finite sample checks the selected addresses from the runner's region; it does not prove every global point of presence serves the same certificate.

If Vercel changes its recommended project DNS target, verify the new value in this project's Domain Settings, update the constant and this document, and rerun. `--origin-target` allows an explicitly verified replacement during the transition. Do not substitute a Cloudflare-proxied public hostname for the origin target; that would check Cloudflare twice.

Unit tests require no credentials, live network, or third-party packages:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
```

## DNS-challenge issuance and verification

Keep the existing US-only access policy, crawler restrictions, Bot Fight Mode, and Full (strict) origin TLS. Use DNS validation when required because HTTP validation can encounter those traffic restrictions. Vercel documents generating fresh challenge records and finalizing issuance after DNS propagation in its [certificate pre-generation procedure](https://vercel.com/docs/domains/pre-generating-ssl-certs).

1. Confirm the authenticated Vercel account and the `burntfrosts-projects` team. Record the current check results and certificate IDs/hostnames/expiries from `vercel certs ls --scope burntfrosts-projects`.
2. Generate a **fresh** DNS challenge for both names:

   ```sh
   vercel certs issue soistartedblasting.com www.soistartedblasting.com --challenge-only --scope burntfrosts-projects
   ```

3. In Cloudflare, create only the TXT name/value pairs returned by that invocation. Track their record IDs. Preserve unrelated TXT records, including any concurrent challenge at the same name. Existing old TXT values are not a permanent renewal mechanism. Do not commit challenge values or provider credentials.
4. Query each exact returned TXT name against the zone's authoritative nameservers and verify that every fresh value is visible. Then finalize with the same hostnames and team:

   ```sh
   vercel certs issue soistartedblasting.com www.soistartedblasting.com --scope burntfrosts-projects
   ```

5. Confirm issuance succeeded and that the replacement certificate covers both names. Run `python3 tools/check-certificates.py --repeats 5`; all served origin certificates must clear the 45-day threshold and public edge certificates the separate 14-day threshold. Check both public pages and a protected direct deployment afterward.
6. If an older overlapping certificate is still selected, identify its exact certificate ID, prove the replacement covers **all** of its names, and verify that no other project needs it before retiring that exact old certificate with `vercel certs rm CERTIFICATE_ID --scope burntfrosts-projects`. Rerun repeated direct-origin and public checks. Do not delete a valid certificate merely because another one was just requested. If Vercel refuses deletion because the certificate is system-managed, retain it, record the refusal and affected hostname/address, and escalate certificate selection to Vercel support. Keep the check failing until all sampled origin certificates clear the lead threshold; do not detach domains or weaken TLS to force removal.
7. Only after issuance and validation succeed, remove the specific fresh TXT records created in step 3 by their tracked record IDs. Preserve unrelated or concurrent records. Rerun verification and record the new served expiry, certificate IDs, validation time, and next action deadline.

Start this procedure within the 45-day lead window; investigate persistent issuance or mixed-certificate failures immediately. A successful DNS challenge proves issuance works, not complete recovery while an older certificate remains served or future unattended renewal. The recurring operator check must remain active until the traffic policy and automatic renewal path have been verified together.
