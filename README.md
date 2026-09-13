# So I Started Blasting

An interactive 3D apocalypse cinema at [soistartedblasting.com](https://soistartedblasting.com/), with ten original movie-inspired scenes and cosmic visualizations.

| Film inspiration | Visualization |
| --- | --- |
| Independence Day | Mothership, energy beam, collapsing skyline |
| Deep Impact | Comet strike, tsunami, sea spray |
| The Day After Tomorrow | Superstorm, snowfall, frozen city |
| Melancholia | Rogue planet, atmosphere, final collision |
| Terminator 2 | Nuclear fireball, mushroom cloud, expanding shockwave |
| 2012 | Fractured crust, glowing chasm, tumbling debris |
| War of the Worlds | Walking tripods, scanning heat rays, red growth |
| Knowing | Solar photosphere, magnetic loops, superflare |
| Armageddon | Rugged asteroid, glowing fissures, fragment field |
| Interstellar | Black hole, accretion disk, lensed halo, orbiting craft |

All scenes use the same reversible 30-second timeline and adaptive quality tiers. Cosmic visuals are cinematic interpretations; the black-hole halo is a geometric lensing approximation. No new remote model downloads are needed for the six added scenes.

The simulation includes authored architectural and spacecraft models, physically based surface materials, HDR lighting, animated weather and particles, and adaptive graphics quality for phones. Scene playback, timeline scrubbing, camera orbit, replay, and graphics controls run entirely in the browser.

Enable **Sound** beneath the player for original scene ambience, synchronized impact effects, and a short synthetic introduction. Volume, pause, replay, speed changes, and timeline scrubbing share the simulation clock. Audio downloads only after consent; missing sounds do not interrupt rendering. Layered storm clouds, distant haze, planetary cloud decks, wave foam, and a generated nebula backdrop add depth while respecting the adaptive quality tiers. See [the media upgrade](docs/media-upgrade.md) for tooling, provenance, and verification.

## Run locally

From the repository root:

```sh
npm ci
npm run build
npm run serve
```

Open the localhost URL printed by the server. Node 24, npm, Python 3 (verification), and a WebGL-capable browser are required. Three.js 0.170.0 and its used addons are copied from the locked npm dependency into the hashed build, with their license. Rendering has no runtime CDN dependency; Google Fonts is optional and falls back to system fonts. Models, texture maps, and the HDR environment are included in this repository.

There is no application backend or required environment variable. Edit `dist`, then rebuild; its bare module imports require the build step. Baseline scenes render before optional artwork finishes loading. Failed maps use simpler materials, failed models retain procedural geometry, and each new terrestrial/cosmic scene is constructed only on its first selection.

Run the complete release gate:

```sh
npx playwright install chromium
npm run check
```

The gate includes unit tests, certificate-checker tests, committed asset checksums, the hashed build, and browser regressions. GitHub's `quality` check runs with Node 24. Browser failure probes cover optional assets, WebGL creation, context loss, deterministic scrubbing, fullscreen, and narrow-screen controls.

## Code and assets

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Interface and layout |
| `dist/boot.js` | Browser startup and failure handling |
| `dist/simulation.js` | Scene construction, animation, camera, and controls |
| `dist/scenes.js` | Shared scene catalogue for the picker, analytics, and control API |
| `dist/scene-config.js` | Stable renderer identity, camera, and centralized scene environment settings |
| `dist/runtime-state.js` | Privacy-aware bootstrap failures and shared failure UI |
| `dist/terrestrial.js`, `dist/cosmic.js` | Six additional procedural scene visualizations |
| `dist/cinema.js` | Materials, effects, and adaptive graphics |
| `dist/atmosphere.js`, `dist/audio.js` | Optional atmospheric textures and consent-based synchronized sound |
| `dist/production.js` | Model loading, instancing, and environment setup |
| `dist/analytics.js`, `dist/telemetry.js` | Analytics bootstrap and sampled graphics measurements |
| `dist/assets/` | Compressed GLB models, WebP textures, HDR, and provenance |
| `tools/author-assets.py` | Blender source for the original procedural models |
| `tools/build.mjs` | Deterministic asset fingerprints and rewritten dependency URLs |
| `tools/README.md` | Asset rebuilding and compression commands |
| `tools/check-certificates.py`, `docs/certificate-operations.md` | Verified edge/origin expiry checks and DNS renewal operations |
| `.openai/hosting.json` | Existing Sites project and static output configuration |
| `vercel.json` | Static deployment configuration for the connected Vercel project |

See [the asset pipeline](tools/README.md) for rebuilding the models, and [asset sources](dist/assets/SOURCES.md) for Poly Haven texture and environment credits under CC0. Film titles identify visual inspiration; this is an unofficial interactive tribute.

## Deployment

The checked-in `dist` directory remains the editable static source. Vercel runs `npm ci` and `npm run build`, then serves the generated, ignored `build` directory. GitHub `main` deploys to the `so-i-started-blasting` project in `burntfrosts-projects`. Changes use pull requests and the required `quality` check; previews and direct origins remain protected.

`soistartedblasting.com` and `www.soistartedblasting.com` now use Vercel behind Cloudflare's proxy. Their former Sites custom-domain attachments were removed during the September 12, 2026 cutover; `.openai/hosting.json` retains the original Sites project for historical source continuity.

The build fingerprints JavaScript, CSS, models, textures, and HDR files from their SHA-256 content hashes. Local and vendored dependency URLs are rewritten before hashing the importing file, so an asset update changes its importer URLs all the way back to the HTML entrypoint. Runtime asset URLs must be explicit local string literals; dynamically assembled filenames fail the build. Vercel's `/_vercel/` scripts remain provider supplied. `build/asset-manifest.json` records the source-to-output mapping. Dependency resolution validates before staged publication replaces the previous successful build.

Vercel caches only fingerprinted files under `/immutable/` for one year with `immutable`. HTML, the manifest, and other unversioned files revalidate. The configuration retains the existing Vercel project alias redirect to the public domain and security headers. The public domain's hosting and Cloudflare access policy are managed separately from the repository build.

Vercel Authentication protects every deployment and direct origin request. Cloudflare injects a dedicated origin credential for HTTPS requests to the two public hostnames. The credential is managed in provider settings and must never be committed or exposed in client code. Cloudflare removes the bypass-cookie request header and blocks reserved bypass query parameters, including recursively encoded forms. Existing US-only, crawler, bot, and TLS protections remain enabled; origin TLS uses Full (strict).

Certificate renewal uses the [DNS challenge runbook](docs/certificate-operations.md), preserving the audience rules. Run `python3 tools/check-certificates.py` to verify the Cloudflare edge and both Vercel origin hostnames with fresh handshakes. The origin lead time is 45 days; Cloudflare's managed edge lead time is 14 days. DNS issuance was exercised during the September 13 UTC remediation. Do not rely on a historical expiry date or existing TXT values; verify the certificates currently served and publish fresh challenge values for each issuance.

The public header policy matches `vercel.json`: DENY framing, nosniff, strict-origin referrers, restricted device permissions, and two-year HSTS with subdomains/preload intent. Cloudflare's generic security-header transform is disabled so it cannot overwrite these values; its HSTS setting matches the same policy. The preload token does not mean the domain has been submitted to a browser preload list. Cloudflare's content-cache rule retains its immutable legacy ruleset name but is described as Vercel cache ownership and still bypasses duplicate caching.

Content Security Policy starts in **report-only mode**. It permits the local hashed engine, Google fonts, Vercel analytics and preview toolbar, and Cloudflare challenge/analytics scripts. App startup and all ten scenes pass an enforced-policy preview probe. The public Cloudflare bot-detection inline script still produces an expected report-only violation: a response-header Transform Rule nonce arrives too late to nonce that injected script. Do not enforce the policy until a fresh per-response nonce reaches Cloudflare before script injection and both public and preview paths pass browser checks. No script `unsafe-inline`, static nonce, bot-protection exemption, or extra application server was added to hide this incompatibility. Reports are observable in browser security-policy events/console; there is no central report collector.

The project uses the Basic build machine. The first remediation preview completed successfully there, and the required Linux CI suite separately validates the full build and browser regressions. Hardware rendering performance comes from the client graphics changes, not the build-machine size.

This replacement preserves the previous video-clip application in Git history. Its API functions, scheduled clip checks, and package dependencies are no longer part of the current application.

## Graphics telemetry

Base Web Analytics is enabled for the Vercel project, and `/_vercel/insights/script.js` is available on the public domain. The repository uses the standard HTML analytics API and does not require Analytics Plus. For another project, enable Web Analytics and redeploy to activate its collection endpoint. Vercel Authentication protects previews and production origins; Cloudflare authenticates the public domain's origin requests.

| Event | Meaning |
| --- | --- |
| `Scene Ready` | Navigation to the first baseline render; later scenes measure selection to first render. Hidden loading time is excluded. Once per scene. |
| `First Render Work` | CPU/driver time submitting a scene's first frame, including initially paused scenes; not GPU presentation time. |
| `Authored Render Work` | One measurement of the first non-space frame after optional artwork becomes available. |
| `First Load Stall` | Peak visible active frame interval during the initial second, separate from steady-state sampling. |
| `Graphics Quality` | Automatic tier changes and their reason (`slow`, `headroom`, or `viewport`). Deduplicated, with at most eight transitions per page. |
| `Frame Rate` | Average rendered FPS within one sampled window per scene/tier. |
| `Frame Time P95` | 95th-percentile frame interval from the same window, in milliseconds. |
| `Scene Load Failed` | Allowlisted module-load, WebGL-init, authored-assets, or context-lost stage. Deduplicated per scene/stage with a page cap; no URLs or raw error messages. Optional artwork failure does not stop rendering. |

Frame measurements exclude paused/background gaps, allow one second of settling, and collect up to ten seconds or 1,200 frame intervals. Useful partial windows of at least five seconds flush on scene/tier changes or page exit. Each event has two properties to fit base Pro analytics. No per-frame network requests, custom identifiers, or browser storage are used. DNT and Global Privacy Control disable tracking; page URLs have query strings and fragments removed. Analytics is disabled on localhost, and a blocked analytics script does not stop rendering.
