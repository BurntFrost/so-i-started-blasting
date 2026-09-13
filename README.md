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

## Run locally

From the repository root:

```sh
python3 -m http.server 4173 --directory dist
```

Open <http://localhost:4173>. Use an HTTP server rather than opening the HTML file directly. A WebGL-capable browser and an internet connection are required: Three.js 0.170.0 and its addons load from jsDelivr, and fonts load from Google Fonts. Models, texture maps, and the HDR environment are included in this repository.

There is no package installation, backend, or required environment variable. The source runs directly from `dist`; Vercel uses a dependency-free Node.js build to fingerprint assets for caching.

To preview the Vercel output locally:

```sh
node tools/build.mjs
python3 -m http.server 4173 --directory build
```

Run verification with `node --test tests/*.test.mjs`.

## Code and assets

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Interface and layout |
| `dist/boot.js` | Browser startup and failure handling |
| `dist/simulation.js` | Scene construction, animation, camera, and controls |
| `dist/scenes.js` | Shared scene catalogue for the picker, analytics, and control API |
| `dist/terrestrial.js`, `dist/cosmic.js` | Six additional procedural scene visualizations |
| `dist/cinema.js` | Materials, effects, and adaptive graphics |
| `dist/production.js` | Model loading, instancing, and environment setup |
| `dist/analytics.js`, `dist/telemetry.js` | Analytics bootstrap and sampled graphics measurements |
| `dist/assets/` | Compressed GLB models, WebP textures, HDR, and provenance |
| `tools/author-assets.py` | Blender source for the original procedural models |
| `tools/build.mjs` | Deterministic asset fingerprints and rewritten dependency URLs |
| `tools/README.md` | Asset rebuilding and compression commands |
| `.openai/hosting.json` | Existing Sites project and static output configuration |
| `vercel.json` | Static deployment configuration for the connected Vercel project |

See [the asset pipeline](tools/README.md) for rebuilding the models, and [asset sources](dist/assets/SOURCES.md) for Poly Haven texture and environment credits under CC0. Film titles identify visual inspiration; this is an unofficial interactive tribute.

## Deployment

The checked-in `dist` directory remains the editable static source. Vercel runs `node tools/build.mjs` and serves the generated, ignored `build` directory. GitHub `main` deploys to the `so-i-started-blasting` project in `burntfrosts-projects`.

`soistartedblasting.com` and `www.soistartedblasting.com` now use Vercel behind Cloudflare's proxy. Their former Sites custom-domain attachments were removed during the September 12, 2026 cutover; `.openai/hosting.json` retains the original Sites project for historical source continuity.

The build fingerprints JavaScript, CSS, models, textures, and HDR files from their SHA-256 content hashes. Local dependency URLs are rewritten before hashing the importing file, so an asset update changes its importer URLs all the way back to the HTML entrypoint. Runtime asset URLs must be explicit local string literals; dynamically assembled filenames fail the build. External CDN imports and Vercel's `/_vercel/` scripts remain unchanged. `build/asset-manifest.json` records the source-to-output mapping for troubleshooting.

Vercel caches only fingerprinted files under `/immutable/` for one year with `immutable`. HTML, the manifest, and other unversioned files revalidate. The configuration retains the existing Vercel project alias redirect to the public domain and security headers. The public domain's hosting and Cloudflare access policy are managed separately from the repository build.

Vercel Authentication protects every deployment and direct origin request. Cloudflare injects a dedicated origin credential for HTTPS requests to the two public hostnames. The credential is managed in provider settings and must never be committed or exposed in client code. Cloudflare removes the bypass-cookie request header and blocks reserved bypass query parameters, including recursively encoded forms. Existing US-only, crawler, bot, and TLS protections remain enabled; origin TLS uses Full (strict).

The current origin certificate covers both hostnames and expires December 12, 2026. HTTP ACME requests reach Vercel's validation handler without redirects or origin credentials from the tested US location. Unattended renewal is not guaranteed while US-only filtering and Free Bot Fight Mode remain enabled: external validation locations may be blocked. If renewal fails, use Vercel's DNS challenge workflow (`vercel certs issue soistartedblasting.com www.soistartedblasting.com --challenge-only`), publish its fresh TXT values in Cloudflare, then finalize issuance with the same command without `--challenge-only`. Verify both origin certificates before expiration; existing TXT values are not a permanent renewal mechanism.

This replacement preserves the previous video-clip application in Git history. Its API functions, scheduled clip checks, and package dependencies are no longer part of the current application.

## Graphics telemetry

Base Web Analytics is enabled for the Vercel project, and `/_vercel/insights/script.js` is available on the public domain. The repository uses the standard HTML analytics API and does not require Analytics Plus. For another project, enable Web Analytics and redeploy to activate its collection endpoint. Vercel Authentication protects previews and production origins; Cloudflare authenticates the public domain's origin requests.

| Event | Meaning |
| --- | --- |
| `Scene Ready` | Navigation to the first authored-assets render; later scenes measure selection to first render. Hidden loading time is excluded. Once per scene. |
| `Graphics Quality` | Automatic tier changes and their reason (`slow`, `headroom`, or `viewport`). Deduplicated, with at most eight transitions per page. |
| `Frame Rate` | Average rendered FPS within one sampled window per scene/tier. |
| `Frame Time P95` | 95th-percentile frame interval from the same window, in milliseconds. |
| `Scene Load Failed` | Authored-asset initialization failed; no failing URLs or error messages are sent. |

Frame measurements exclude paused/background gaps, allow one second of settling, and collect up to ten seconds or 1,200 frame intervals. Useful partial windows of at least five seconds flush on scene/tier changes or page exit. Each event has two properties to fit base Pro analytics. No per-frame network requests, custom identifiers, or browser storage are used. DNT and Global Privacy Control disable tracking; page URLs have query strings and fragments removed. Analytics is disabled on localhost, and a blocked analytics script does not stop rendering.
