# Graphics A0 capture tooling

Start the built site with `npm run serve`, then use the same capture command for every graphics pass. The quality flag selects the tier through the browser's viewport, touch capability, and device pixel ratio; the tool verifies the canvas actually selected that tier.

```sh
TEST_BASE_URL=http://127.0.0.1:4175 node tools/capture-media.mjs capture --quality ultra --output work/graphics-before
node tools/capture-media.mjs capture --quality high --scene twister --output work/twister-high
node tools/capture-media.mjs probe --quality ultra --scene evangelion --second 16 --output work/probes
node tools/capture-media.mjs compare work/graphics-before work/graphics-after --output work/graphics-diff
```

Capture mode uses the fifteen catalogue ids as PNG names and their reviewed hero beats. It writes `capture.json` and an ImageMagick `contact-sheet.jpg`. Repeat `--scene`, or pass comma-separated ids, to capture a subset.
Set `CAPTURE_FONT` to an installed font file when running outside macOS; the default is the system Arial font on this Mac.

Probe mode plays one scene for seven seconds from `--second`. It supports HIGH and ULTRA, records every real `data-fps` update, and reports the requested ceiling, FPS samples, and final tier. A run with no timed sample fails.

Compare mode requires `capture.json` in both directories, matching scene sets, and every listed PNG. It writes per-scene absolute-error images, prints differing-pixel counts, and creates a diff contact sheet. Missing files and mismatched scene sets fail before comparison.

`npm test` first runs `node --check` over every `dist/*.js` module, then runs the unit suite.
