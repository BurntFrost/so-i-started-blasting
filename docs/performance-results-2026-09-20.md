# Progressive assets and production JavaScript — 2026-09-20

Implemented on `codex/progressive-assets-build`. Production deployment is pending.

## Behavior

- The city, ship, sky, and six material maps are adopted independently as they finish. A stalled or failed sky no longer holds back the models. Procedural fallbacks, per-asset deadlines, and cancellation remain in place.
- Every visitor starts with `dusk.hdr` (1,526,564 bytes). After the base assets settle, visitors still at ULTRA with an ULTRA startup ceiling may download `dusk-2k.hdr` (5,996,454 bytes). Save-Data and reported slow-2g, 2g, or 3g connections skip this upgrade. Browsers without Network Information API support can upgrade.
- The sharper panorama changes the visible sky only. Reflections are generated once from the smaller HDR; replacing the panorama releases its old source texture. An upgrade failure keeps the base sky and the scene ready.
- Production JavaScript is bundled, tree-shaken, minified, and split into shared chunks with pinned esbuild 0.28.2. Public application module URLs remain available. Class/function names are preserved for runtime compatibility; vendor licenses remain in the output.
- Existing transitive content hashes, asset validation, and atomic build publication remain. Production JavaScript no longer uses redundant `?v=3` URLs. The obsolete standalone engine preload is removed from bundled HTML. Development builds retain the readable module graph and profiling tools.

## Size comparison

Both variants use the same new application source. The comparison isolates the production bundling change: `build({ optimize: false })` versus the default optimized build. Sizes sum all emitted JavaScript files, not just the modules fetched by one visit. Gzip uses Node's default `gzipSync` settings; it does not represent Cloudflare's negotiated compression.

| Metric | Unbundled | Bundled | Reduction |
| --- | ---: | ---: | ---: |
| JavaScript files | 64 | 62 | 2 |
| Uncompressed bytes | 5,703,330 | 2,097,839 | 63.2% |
| Gzip bytes | 1,160,371 | 582,814 | 49.8% |

The initial ULTRA sky payload is 74.5% smaller. This is progressive loading, not a reduction in total bytes for visitors who receive both panoramas: a successful upgrade downloads an additional 1,526,564 bytes compared with loading only the old larger sky. Save-Data/slow-connection ULTRA visitors save 4,469,890 bytes by staying on the smaller panorama. Smaller PMREM reflections may differ slightly from the former ULTRA lighting; no claim of pixel equivalence with the old build is made.

No field Core Web Vitals improvement, physical-phone speedup, or GPU-time reduction has been measured. The verified improvements are smaller emitted JavaScript and independent asset readiness.

## Validation

- Full Node unit suite passed on Node 24.19.0, including optimized-build determinism, shared-module initialization, removed vendor exports, canonical imports, transitive invalidation, and failed-build preservation.
- Asset lifecycle tests passed for both model/texture arrival orders, UV availability for late maps, timeouts, cancellation, fallback models, and separate sky/base readiness.
- Ten Python certificate tests passed; all 78 asset SHA-256 checksums passed; production build and whitespace checks passed.
- Chrome browser checks passed for all 15 scenes in the general interaction test, a held-back sky with ready models, failed city fallback, Save-Data, failed sharp-sky fallback, and ULTRA rendering/reverse scrubbing.
- All 32 native WebGL/WebGPU checks passed: 15 scene render/reverse-pixel checks and one phone-sized geometry-budget check per backend (5.8 minutes, one worker).
- Safari/WebKit remains unverified locally. The pinned WebKit binary is absent, and all attempted Playwright download mirrors timed out. The pinned Chromium download also timed out; browser checks use the installed Google Chrome channel. A Chrome session closed during one combined run; the isolated ULTRA rerun passed.

Generated size-comparison builds are ignored by Git under `outputs/performance/progressive-assets/{unbundled,bundled}`. Tests can be rerun with `npm test`, `npm run test:certificates`, `npm run assets:verify`, and `PLAYWRIGHT_CHANNEL=chrome npx playwright test` with the appropriate project and test filters. Safari verification remains necessary before release.

## Main files

- `dist/production.js`: independent asset adoption, progressive sky, material updates.
- `dist/sky-loading.js`: the selected network and quality upgrade policy.
- `dist/simulation.js`: partial-asset render wakeups and base readiness telemetry.
- `tools/bundle.mjs` and `tools/build.mjs`: production optimization before hashing and atomic publication.

The build uses the documented [esbuild splitting and minification APIs](https://esbuild.github.io/api/).
