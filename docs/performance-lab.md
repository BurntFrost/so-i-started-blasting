# Performance lab

Three.js is pinned to 0.186.0 and the production renderer is the WebGPU node renderer with an automatic WebGL fallback (see [the native renderer](graphics-c2-node-renderer.md)). `stats-gl` 4.2.3 is an exact development dependency and supports the pinned engine.

## Local profiling

```sh
npm ci
npm run build:dev
PORT=4175 npm run serve:dev
```

Open `http://127.0.0.1:4175/?stats=1` for the development-only overlay. The stats module is dynamically loaded only when requested. One timer query surrounds the whole compositor, including all its passes. The CPU number measures render submission; scene updates and physical presentation are outside it. `data-gpu-timing="unavailable"` means the browser does not expose the timer-query extension; it is not a zero-millisecond GPU measurement. Context loss and page exit dispose the profiler.

The normal `npm run build` output has a null development entry and neither library in its asset manifest. Changing a query parameter on a production build cannot activate the lab.

## Adaptive quality

The controller collects one second of active frame intervals, excluding idle gaps and the first resumed interval. Mean intervals above about 19.2 ms (52 FPS), or more than 15% of frames exceeding 25 ms, trigger a reduction. It first lowers resolution to 90%, then 80%, preserving the current lighting, particles and geometry. Continued overload then drops a detail tier and restores that tier's normal resolution. A half-second cooldown follows each adjustment.

Recovery requires eight consecutive healthy windows above 57 FPS with no frames over 25 ms. It restores resolution first, then detail. A viewport change can immediately lower the tier ceiling; higher-resolution assets are never silently enabled after startup. These thresholds provide headroom around a 60 FPS target, not a 60 FPS guarantee. LITE at 80% resolution is the floor.

The controller's behavior is tested against synthetic frame intervals, including isolated spikes, sustained overload, recovery, ceiling changes and idle/resume gaps. Browser checks cover the real renderer integration.

## Compare renderers

Use these development URLs on the same viewport:

| URL query | Behavior |
| --- | --- |
| `?quality=high` | Current renderer, fixed HIGH |
| `?quality=balanced` | Fixed BALANCED for phone emulation |
| `?quality=ultra` | Fixed ULTRA when the startup device ceiling permits it |

The prototype preserves the custom opaque-depth/GTAO pass, deterministic scene simulation, FXAA and film grade. It replaces UnrealBloom with `BloomEffect` and combines bloom composition, AgX tone mapping and display transfer in an `EffectPass`. Bloom has different kernels, so identically named radius/strength values do not imply pixel equivalence. It remains opt-in pending measurement and visual review.

```sh
npm run benchmark:render -- --url http://127.0.0.1:4175 --repeats 2 --seconds 6
node tools/performance/report.mjs outputs/performance/comparison
```

For a before/after adaptive comparison, serve a preserved pre-change build separately and pass `--baseline http://127.0.0.1:4176`. `SERVE_DIR=/absolute/build/path PORT=4176 npm run serve` serves that directory. Without `--baseline`, the harness compares tuned adaptive quality and the two fixed renderer paths only.

Defaults: three deterministic scenes (Independence Day, Deep Impact, Interstellar), desktop 1280×800 at DPR 1, Retina at DPR 2, and 390×844 touch/phone emulation at DPR 2. All run sequentially on the host GPU. Use `--profile desktop|retina|phone-emulation` or `--scene SCENE_ID` for a focused run. Install the isolated browser with `npx playwright install chromium`; `PLAYWRIGHT_CHANNEL=chrome` optionally selects installed Chrome instead. The report records the actual version and GPU backend.

Each scene uses a fresh browser process, waits for authored assets, warms shaders for 1.5 seconds, records playback, then exercises ten trusted keyboard timeline inputs. Alternate repeats reverse renderer order. Fixed comparisons assert matching quality tier and resolution. The overlay is disabled during timed comparisons. Avoid other GPU workloads; power source, browser, renderer, build-manifest hashes and quality transitions are recorded.

Outputs include raw frame intervals, p95/p99/max frame times, counts over 25/50 ms, long tasks, browser Event Timing, an input-to-second-animation-frame proxy, matched screenshots, FFmpeg SSIM (when FFmpeg is installed), and an interactive image comparison. Frame intervals measure headless requestAnimationFrame cadence, not GPU duration or physical presentation. Event Timing excludes events below 16 ms and is quantized; the proxy measures a presentation opportunity, not physical input-to-photon latency. This short scripted test is not a field INP measurement. Viewport emulation does not substitute for physical phone or tablet testing.

Keep the production renderer unless gains repeat at equal settings and the visual tradeoff is acceptable. A lower draw-call count or higher screenshot similarity alone is insufficient.

Package references: [stats-gl](https://github.com/RenaudRohlinger/stats-gl), [postprocessing effect merging](https://github.com/pmndrs/postprocessing/wiki/Effect-Merging).
