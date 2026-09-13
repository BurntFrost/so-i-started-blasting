# So I Started Blasting

An interactive 3D apocalypse cinema at [soistartedblasting.com](https://soistartedblasting.com/), with original scenes inspired by *Independence Day*, *Deep Impact*, *The Day After Tomorrow*, and *Melancholia*.

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

The checked-in `dist` directory remains the editable static source and the Sites deployment directory. Vercel runs `node tools/build.mjs` and serves the generated, ignored `build` directory.

The build fingerprints JavaScript, CSS, models, textures, and HDR files from their SHA-256 content hashes. Local dependency URLs are rewritten before hashing the importing file, so an asset update changes its importer URLs all the way back to the HTML entrypoint. Runtime asset URLs must be explicit local string literals; dynamically assembled filenames fail the build. External CDN imports and Vercel's `/_vercel/` scripts remain unchanged. `build/asset-manifest.json` records the source-to-output mapping for troubleshooting.

Vercel caches only fingerprinted files under `/immutable/` for one year with `immutable`. HTML, the manifest, and other unversioned files revalidate. The configuration retains the existing Vercel project alias redirect to the public domain and security headers. The public domain's hosting and Cloudflare access policy are managed separately from the repository build.

This replacement preserves the previous video-clip application in Git history. Its API functions, scheduled clip checks, and package dependencies are no longer part of the current application.

## Graphics telemetry

Enable base Web Analytics for the Vercel project, then deploy again so Vercel exposes `/_vercel/insights/script.js`. The repository uses the standard HTML analytics API and does not require Analytics Plus. Vercel Authentication protects previews and unique production deployment URLs; the public production domain is managed separately.

| Event | Meaning |
| --- | --- |
| `Scene Ready` | Navigation to the first authored-assets render; later scenes measure selection to first render. Hidden loading time is excluded. Once per scene. |
| `Graphics Quality` | Automatic tier changes and their reason (`slow`, `headroom`, or `viewport`). Deduplicated, with at most eight transitions per page. |
| `Frame Rate` | Average rendered FPS within one sampled window per scene/tier. |
| `Frame Time P95` | 95th-percentile frame interval from the same window, in milliseconds. |
| `Scene Load Failed` | Authored-asset initialization failed; no failing URLs or error messages are sent. |

Frame measurements exclude paused/background gaps, allow one second of settling, and collect up to ten seconds or 1,200 frame intervals. Useful partial windows of at least five seconds flush on scene/tier changes or page exit. Each event has two properties to fit base Pro analytics. No per-frame network requests, custom identifiers, or browser storage are used. DNT and Global Privacy Control disable tracking; page URLs have query strings and fragments removed. Analytics is disabled on localhost, and a blocked analytics script does not stop rendering.
