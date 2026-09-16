# A0 tooling report

Implemented commit `95a69ca8d27d25cad593c87e6b9c9be5ebb09013` (`feat: add graphics capture tooling`).

- `capture-media.mjs` now captures all fifteen catalogue ids at reviewed hero beats, filters by `--scene`, selects BALANCED/HIGH/ULTRA through real browser properties, waits for optional authored assets, and writes a labelled contact sheet plus portable manifest.
- Probe mode plays one scene from an explicit second for seven seconds, requires a real `data-fps` mutation, and records the actual final tier and all FPS samples.
- Compare mode validates complete matching capture sets, produces ImageMagick absolute-error images and pixel counts, and generates a diff contact sheet.
- `npm test` syntax-checks all sixteen `dist/*.js` files before the Node suite. Usage and portability details are in `docs/graphics-a0-tooling.md`.

Validation:

- `npm test`: 104/104 passing, including 3 new tooling tests at that point.
- Final focused tooling suite: 4/4 passing after adding mismatched-set coverage.
- Follow-up compare parser suite: 5/5 passing; ImageMagick's `0 (0)` output now reads the leading absolute-error pixel count.
- `node tools/check-syntax.mjs`: all 16 distribution modules pass.
- `git diff --check`: clean.

The first coordinated ULTRA capture reached contact-sheet generation and exposed ImageMagick's missing default font; the tool now passes an explicit system Arial font with `CAPTURE_FONT` override. The parent is coordinating the rerun and GPU probes sequentially, so this task did not launch a competing browser workload.
