# Performance work and benchmark results — 2026-09-19

Development-only `stats-gl` profiling and a `postprocessing` prototype are implemented. The production adaptive-quality controller now reduces resolution before detail and reacts to sustained 45 FPS conditions that the old below-38-FPS policy left unchanged. Keep the current compositor as the production default: this benchmark did not establish a frame-time or interaction-latency benefit from replacing it, and bloom changes the visual result.

Three.js remains pinned to 0.170.0. The WebGPU migration is separate.

## Implementation

- `npm run build:dev` writes an isolated `build-dev/`; `?stats=1` dynamically enables `stats-gl`. The normal production build excludes both new packages and the prototype module, verified by a build test.
- The controller samples active frame intervals for one second, first lowers resolution to 90% and 80%, then lowers detail if overload continues. Eight healthy windows are required to recover. Idle/resume gaps cannot lower quality, and viewport ceilings still apply.
- The prototype combines bloom composition, AgX tone mapping and display transfer using `postprocessing`, while retaining the current opaque depth/GTAO, FXAA and film-grade stages. It saves three draw calls in the compared scenes but remains opt-in.
- [The lab guide](performance-lab.md) contains commands, measurement definitions, controls and limitations.

## Measured comparison

The completed run contains **72 cases**, **25,848 frame intervals**, **720 trusted keyboard timeline inputs**, and **72 screenshots**. Two repeats used reversed renderer order. All 36 repeat screenshot pairs were byte-identical.

Hardware was an Apple M5 Mac with 24 GB RAM, on battery throughout the measured cases, running headless Chrome 153.0.8010.52 with the ANGLE Metal Apple M5 backend. The same three scenes—Independence Day, Deep Impact and Interstellar—were tested at desktop 1280×800/DPR 1, Retina 1280×800/DPR 2, and phone-sized 390×844/DPR 2 with touch emulation. Each run used a fresh browser process, 1.5 seconds of shader warm-up, six seconds of playback and ten timeline inputs.

The adaptive comparison used the preserved pre-change build at commit `ef0a1f3d894a7cf59e90d4bf5f1391e3bd516afc` and the tuned build. The compositor comparison fixed matching HIGH, ULTRA or BALANCED settings according to viewport. Asset-manifest hashes, quality state, raw samples, power source and the GPU backend are recorded in the raw results. stats-gl was disabled during timed comparisons.

The ranges below are ranges of per-run p95 values across 18 cases for each variant.

| Variant | rAF frame p95 | Input-to-second-rAF proxy p95 | Browser Event Timing duration p95 | Frames over 50 ms |
| --- | --- | --- | --- | --- |
| Original adaptive controller | 16.7–16.8 ms | 32.4–33.5 ms | 32–64 ms | 0 |
| Tuned adaptive controller | 16.7–16.8 ms | 32.1–33.6 ms | 32–80 ms | 0 |
| Current compositor, fixed quality | 16.7–16.8 ms | 32.5–33.6 ms | 32–64 ms | 0 |
| Prototype, fixed quality | 16.7–16.8 ms | 32.1–33.6 ms | 32–80 ms | 0 |

All frame p99 values rounded to 16.8 ms. No Long Tasks were observed in the measurement windows. Browser input-delay p95 values ranged from 0.2 to 0.8 ms. No adaptive tier or resolution changes were needed on this hardware during these runs; the controller's overload behavior is validated separately by unit tests and the forced-slow-interval browser test.

These are requestAnimationFrame cadence measurements, not GPU execution times or physical display presentation. The input proxy is a presentation opportunity, not input-to-photon latency. Event Timing durations are quantized and exclude events below 16 ms; these short scripted samples are not field INP. Both renderers already reached the approximately 60 Hz callback limit here, so the data cannot establish spare GPU capacity or gains on slower hardware. Phone-sized emulation uses this Mac's GPU; no physical-phone benchmark was performed. Competing applications and thermal state were not controlled.

## Visual comparison

| Scene | SSIM range across profiles | Observed difference |
| --- | --- | --- |
| Independence Day | 0.979678–0.982246 | Less bloom around the craft and bright highlights |
| Deep Impact | 0.976653–0.997616 | Small changes in wave and city highlight softness; wave geometry and depth effects remain intact |
| Interstellar | 0.889806–0.965520 | More noticeable halo/background glow changes, especially in the phone-sized profile |

SSIM is measured by FFmpeg on the canvas-region screenshots, including overlapping UI. It does not judge aesthetics or prove equivalence. The images reproduce exactly across repeats, so the bloom differences are consistent. Keep the existing look until a repeatable performance gain on a constrained device justifies accepting or further tuning those differences.

The complete local artifacts are in `outputs/performance/final-comparison/`: [report.html](../outputs/performance/final-comparison/report.html) provides interactive comparison sliders, [report.md](../outputs/performance/final-comparison/report.md) contains the full table, and [results.json](../outputs/performance/final-comparison/results.json) contains the raw data. Generated artifacts are ignored by Git. Earlier `smoke`, `diagnostic` and incomplete `comparison` directories were exploratory and are excluded from these results.

## Validation

- Node 24: 126 unit/build tests, 10 certificate tests, 77 asset checksums and the production build passed.
- All 12 Chrome browser cases have passed, including the 15-scene/reverse-scrub case and the new controlled-slow-frame resolution test, but the combined suite is not consistently green. The first combined run passed 11 tests, then Chrome closed during ULTRA; ULTRA passed in isolation and on the next full run. That next run passed 11 tests but found 12 changed edge pixels after camera reset, exceeding the existing four-pixel tolerance. The **unmodified baseline reproduced the same 12-pixel mismatch**, then passed on its next repetition. The assertion was left unchanged. Earlier long-lived Chrome benchmark sessions also closed without page errors; the final 72 cases all passed using a fresh browser process per case.
- WebKit validation could not run: the required browser was absent and downloads from Playwright's official mirrors repeatedly timed out. Physical-device and WebKit performance are not claimed.

The prototype is not enabled by the production build. The development overlay was exercised during playback with a supported GPU timer extension and populated CPU/GPU panels ([example screenshot](../outputs/performance/final-comparison/stats-playing.png)); this smoke check is separate from the benchmark. The report's nine comparison sliders and 18 displayed images were also checked in Chrome. No GPU timing value is claimed for browsers that do not expose the extension.
