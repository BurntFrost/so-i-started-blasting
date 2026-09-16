# Graphics A2: Ambient Occlusion and Render Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish piece A2 of the graphics pipeline pass on branch `codex/graphics-a2-occlusion` (stacked on A1): deterministic ground-truth ambient occlusion at HIGH and ULTRA, an effects layer that keeps particles and volumes out of the shared opaque depth, volume marches that stop at opaque geometry, browser assertions, evidence and the note.

**Architecture:** `dist/ao-pass.js` subclasses r170's `GTAOPass` with seeded noise, a 70% ULTRA target and an explicit `prepass(renderer)` that renders layer 0 normals and depth once before `RenderPass`; `dist/render-kit.js` (the old `volumes.js`) owns `markEffect`/`markEffects`, the per-canvas opaque depth uniforms and the depth-clamped `marchedVolume`; `dist/cinema.js` wires tier flags, the composite pass between `RenderPass` and bloom, the per-scene clip box and `data-ambient-occlusion`. The parked Codex commit (`0e20d6d`, already on the branch) has all of that; this plan closes the remaining gaps.

**Tech Stack:** three.js r170 addons (`GTAOPass`, `SimplexNoise`), node:test unit tests, Playwright Chromium via `PLAYWRIGHT_CHANNEL=chrome`, `tools/capture-media.mjs` capture/compare/probe, ImageMagick.

**Spec:** `docs/superpowers/specs/2026-09-16-graphics-pipeline-pass-design.md`, section "A2. Ambient occlusion" (lines 167-202), plus "Constraints" (50-66) and "Verification per pull request" (316-325). Codex's brief and preflight notes are in the ignored `.superpowers/sdd/2026-09-16-graphics-pipeline-pass-design/` (a2-brief.md, preflight-report.md).

## Global Constraints

- Determinism: "Every pass must be a pure function of the current frame's scene state. Noise textures are static, grain is a hash of pixel position and scene time, denoising is spatial only. `tests/browser.spec.mjs` compares reverse-scrub screenshots byte for byte."
- Tiers: "`dist/cinema.js` owns the tier table (LITE, BALANCED, HIGH, ULTRA) and the FPS governor. New passes are enabled by tier flags in that table, never by resolution alone." Nothing may add geometry below HIGH; the phone budget test asserts fewer than 150,000 triangles at 390x844 BALANCED.
- Attribute: "`data-ambient-occlusion` is `gtao` when the pass runs and `none` otherwise."
- GTAO parameters: `radius` 6, `distanceExponent` 1, `thickness` 1, `scale` 1, `samples` 16, `pdRings` 2, `pdSamples` 16, `blendIntensity` 1; full resolution at HIGH, 70% at ULTRA, bilinearly upsampled.
- Effects layer: everything marked with `markEffect` is invisible to the occlusion buffer; the prepass renders layer 0 only. Effect renderables also stop casting shadows.
- Frame rate: the five heaviest scenes at ULTRA (Independence Day, Terminator 2, Day After Tomorrow, War of the Worlds, Evangelion) hold 60 fps on this Mac or the governor demotes them, and the sheet shows which.
- Do not change the engine version or any motion equation. Keep phone geometry unchanged.
- Run all commands from the worktree `/Users/steve/Code/so-i-started-blasting/work/graphics-pipeline` with `PATH=/Users/steve/.local/share/mise/installs/node/24/bin:$PATH`. Never run two browser jobs at once on this Mac.

---

### Task 1: Volume-only scenes and the water depth rule

Deep Impact's factory builds exactly three marched volumes (Entry trail, Impact column, Crest spray); its opaque geometry is the shared city in `dist/simulation.js`, so the sweep's "at least one opaque mesh per factory" expectation is wrong for that scene, not the classifier. Separately, `markEffects(scene)` in cinema treats the shared ocean (`transparent, opacity .95`) and wave (`opacity .92`) as effects, which removes them from the depth buffer. The spec expects the ocean plane in the prepass and bounded away by the clip box, and the marches for the crest and column should stop at the water, so water gets an explicit flag.

**Files:**
- Modify: `tests/occlusion.test.mjs:80` (the `opaque>0` assertion) and append one test
- Modify: `dist/render-kit.js:13-19` (`markEffects`)
- Modify: `dist/simulation.js:61` (append one line after the `wave` mesh is created)

**Interfaces:**
- Consumes: `markEffects(root)` and `markEffect(object)` from `dist/render-kit.js` as they exist.
- Produces: `markEffects` skips any object whose `userData.opaqueDepth === true` (and its descendants are still traversed as normal); `simulation.js` flags `ocean` and `wave` that way.

- [ ] **Step 1: Run the sweep to see the current failure**

Run: `node --test tests/occlusion.test.mjs 2>&1 | grep -E "^not ok|error:|^# (pass|fail)"`
Expected: `not ok 9 - every lazy scene factory classifies its effects and preserves opaque meshes` with `error: 'deep-impact'`.

- [ ] **Step 2: Name the volume-only scene in the sweep**

In `tests/occlusion.test.mjs`, replace the line

```js
      if(config.renderer!=='original')assert.ok(opaque>0,config.id);
```

with

```js
      // Deep Impact's factory is three marched volumes over the shared city; its opaque geometry is simulation-owned.
      if(config.renderer!=='original'&&!volumeOnly.has(config.id))assert.ok(opaque>0,config.id);
```

and add, directly after the `try {` line of that test (before `const scene=new THREE.Scene()`):

```js
    const volumeOnly=new Set(['deep-impact']);
```

- [ ] **Step 3: Run the sweep again**

Run: `node --test tests/occlusion.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 4: Write the failing water test**

Append to `tests/occlusion.test.mjs`:

```js
test('surfaces flagged opaqueDepth keep layer 0 and their shadow flag despite alpha', () => {
  const group=new THREE.Group();
  const water=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial({transparent:true,opacity:.95}));
  water.userData.opaqueDepth=true;water.castShadow=true;
  const mist=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({transparent:true}));
  group.add(water,mist);markEffects(group);
  assert.equal(water.layers.mask,1);assert.equal(water.castShadow,true);assert.equal(mist.layers.mask,2);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `node --test tests/occlusion.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `not ok 10 - surfaces flagged opaqueDepth ...` (water.layers.mask is 2), `# fail 1`.

- [ ] **Step 6: Honour the flag in markEffects**

In `dist/render-kit.js`, replace

```js
export function markEffects(root) {
  root.traverse(object => {
    const materials = [].concat(object.material || []);
    if (object.isPoints || object.isLine || object.isSprite || materials.some(m => m.transparent || m.blending === THREE.AdditiveBlending)) markEffect(object);
  });
  return root;
}
```

with

```js
// Transparent or additive renderables are effects unless flagged opaqueDepth: water and other physical surfaces that
// must still occlude and stop volume marches despite their alpha.
export function markEffects(root) {
  root.traverse(object => {
    if (object.userData.opaqueDepth) return;
    const materials = [].concat(object.material || []);
    if (object.isPoints || object.isLine || object.isSprite || materials.some(m => m.transparent || m.blending === THREE.AdditiveBlending)) markEffect(object);
  });
  return root;
}
```

- [ ] **Step 7: Flag the shared water in simulation.js**

In `dist/simulation.js`, directly after the line that creates `wave` (line 61, ending `effects.add(wave);`) and before `const waveBase=...`, insert:

```js
// Water is a physical surface: it stays in the opaque depth so occlusion and volume marches stop at it; the AO clip box keeps the 650-unit plane cheap.
for(const surface of [ocean,wave])surface.userData.opaqueDepth=true;
```

- [ ] **Step 8: Run the whole unit suite**

Run: `npm test 2>&1 | grep -E "Syntax checked|ℹ (pass|fail)"`
Expected: `Syntax checked 17 dist modules.`, `ℹ pass 111`, `ℹ fail 0` (110 on A1 plus the new water test).

- [ ] **Step 9: Fold the fixes into the feature commit**

The branch head is the parked WIP commit. Amend it into the real feature commit:

```bash
git add dist/render-kit.js dist/simulation.js tests/occlusion.test.mjs
git commit --amend -F - <<'EOF'
feat: add ground-truth ambient occlusion and a shared opaque depth for effects

GTAO at HIGH (full resolution) and ULTRA (70%, bilinearly upsampled) with
seeded noise and a spatial denoise, composited between RenderPass and bloom.
An explicit prepass renders layer 0 normals and depth once before the colour
pass, so marched volumes clamp their span at opaque geometry in the same
frame. render-kit.js (formerly volumes.js) owns markEffect/markEffects and
the per-canvas depth uniforms; every factory marks points, sprites and
transparent or additive materials as effects, water is flagged opaqueDepth
so it still occludes, and data-ambient-occlusion reports gtao or none.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Expected: `git log --oneline -1` shows the new subject on top of `adbe951`.

---

### Task 2: Browser assertions for the tier attribute

**Files:**
- Modify: `tests/browser.spec.mjs:127` (HIGH test, after the `data-antialias` assertion), `tests/browser.spec.mjs:136` (after the phone-size `data-quality` assertion), `tests/browser.spec.mjs:277` (ULTRA test, after the `data-antialias` assertion)

**Interfaces:**
- Consumes: `canvas.dataset.ambientOcclusion` written by `setQuality` in `dist/cinema.js` (`gtao` when `tier.ao`, else `none`).
- Produces: nothing new; the existing reverse-scrub byte-equality in both tests now runs with the pass on, which is the determinism check the spec names.

- [ ] **Step 1: Add the three assertions**

In the HIGH test (`test.describe('desktop HIGH rendering', ...)`), after

```js
    await expect(canvas).toHaveAttribute('data-antialias', 'fxaa');
```

add

```js
    await expect(canvas).toHaveAttribute('data-ambient-occlusion', 'gtao');
```

and after

```js
    await expect(canvas).toHaveAttribute('data-quality', /balanced|lite/);
```

(the phone-size resize in the same test) add

```js
    await expect(canvas).toHaveAttribute('data-ambient-occlusion', 'none');
```

In the ULTRA test (`test.describe('desktop ULTRA rendering', ...)`), after its

```js
    await expect(canvas).toHaveAttribute('data-antialias', 'fxaa');
```

add

```js
    await expect(canvas).toHaveAttribute('data-ambient-occlusion', 'gtao');
```

- [ ] **Step 2: Build and run the two tests**

Run: `npm run build && PLAYWRIGHT_CHANNEL=chrome npx playwright test --project=chromium -g "HIGH rendering|ULTRA rendering" --reporter=list 2>&1 | grep -E "✓|✘|passed|failed"`
Expected: both pass. The attribute is already implemented, so there is no red step here; if either fails on the attribute, the tier wiring in `setQuality` is wrong and must be fixed before continuing. If the byte-equality step fails, the pass is not deterministic (check `generateNoise` seeding and that `prepass` runs exactly once per frame).

- [ ] **Step 3: Commit**

```bash
git add tests/browser.spec.mjs
git commit -m "test: assert the ambient occlusion tier attribute at HIGH, ULTRA and phone size

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Evidence: sheets, compare, probes and the occlusion walk

The before set is the A1 capture at `work/graphics-a1-final` (fifteen ULTRA frames, identical hero beats). Everything runs on a private server port so Codex's server on 4175 is untouched.

**Files:**
- Create (ignored): `work/graphics-a2-final/`, `work/graphics-a2-diff/`, `work/graphics-a2-final-probes/`
- Create: `docs/graphics-pipeline/a2-after.jpg` (copied from the capture's contact sheet)

- [ ] **Step 1: Capture, compare and probe**

Run (from the worktree, after `npm run build`):

```bash
PORT=4176 node tools/serve.mjs > /tmp/serve-4176.log 2>&1 & SERVER=$!
for i in $(seq 1 50); do curl -sf http://127.0.0.1:4176/ > /dev/null && break; sleep 0.2; done
rm -rf work/graphics-a2-final work/graphics-a2-diff work/graphics-a2-final-probes
node tools/capture-media.mjs capture --quality ultra --output work/graphics-a2-final --url http://127.0.0.1:4176
node tools/capture-media.mjs compare work/graphics-a1-final work/graphics-a2-final --output work/graphics-a2-diff
for scene in independence-day terminator-2 day-after-tomorrow war-of-the-worlds evangelion; do
  for q in ultra high; do
    node tools/capture-media.mjs probe --quality $q --scene $scene --second 16 --output work/graphics-a2-final-probes --url http://127.0.0.1:4176 > /dev/null || echo "PROBE FAILED $scene $q"
  done
done
kill $SERVER
node -e 'const fs=require("fs"),d="work/graphics-a2-final-probes";for(const f of fs.readdirSync(d).sort()){const p=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));console.log([p.scene,p.quality,JSON.stringify(p.samples),p.finalTier,p.errors.length].join("\t"));}'
```

Expected: `capture.json` reports 15 frames and 0 errors; compare prints fifteen lines of absolute error and RMSE (the city scenes change most, space scenes least, since AO only darkens creases); every probe prints two samples and a final tier.

- [ ] **Step 2: Apply the frame-rate rule**

If every ULTRA probe holds 60: record the table and move on. If an ULTRA probe dips below 60 or the governor demotes (`finalTier` is `high`): profile by disabling the pass in the built bundle, exactly as the spec prescribes:

```bash
sed -i '' "s/{name:'ULTRA',ao:true,aoScale:.7/{name:'ULTRA',ao:false,aoScale:.7/" build/cinema.*.js
```

(check the fingerprinted filename with `ls build/cinema.*.js` first), rerun that scene's ULTRA probe, restore the build with `npm run build`, and record both numbers. The spec accepts either 60 fps or a governor demotion that the sheet shows; the note states which and the cost the pass measured.

- [ ] **Step 3: Walk the occlusion at full resolution**

Crop the same regions from before and after and view them side by side:

```bash
S=/private/tmp/claude-501/-Users-steve-Code-so-i-started-blasting/9c27c6cc-60d3-4b96-9a50-b9a0d3fabf58/scratchpad
rows=()
while read -r scene geom; do
  magick work/graphics-a1-final/$scene.png -crop $geom +repage -resize 60% $S/ao-before-$scene.png
  magick work/graphics-a2-final/$scene.png -crop $geom +repage -resize 60% $S/ao-after-$scene.png
  magick $S/ao-before-$scene.png $S/ao-after-$scene.png -bordercolor '#222' -border 6 +append $S/ao-row-$scene.png
  rows+=($S/ao-row-$scene.png)
done <<'LIST'
independence-day 900x600+400+700
war-of-the-worlds 900x600+900+700
twister 900x600+700+500
deep-impact 900x600+300+700
LIST
magick "${rows[@]}" -append $S/ao-walk.jpg
```

Then view `$S/ao-walk.jpg`. Expected: alleys, roof edges and building bases darken; whole facades do not (radius 6 against 3 to 6 unit buildings); Twister's trees at the funnel's edge and Deep Impact's farm at the wave's foot no longer draw behind the volume; the sky and space backgrounds are untouched. If facades darken wholesale, lower `radius` in `dist/ao-pass.js` (try 4) and repeat Step 1; if creases show grain that differs between the two 18 s screenshots in Task 2, the noise is not seeded.

- [ ] **Step 4: Stage the sheet**

```bash
/bin/cp work/graphics-a2-final/contact-sheet.jpg docs/graphics-pipeline/a2-after.jpg
```

Expected: about 600 KB; the A1 sheet `a1-after.jpg` is the before image for the note, so nothing else is copied.

---

### Task 4: The note, the full gate and finishing

**Files:**
- Create: `docs/graphics-a2-occlusion.md`
- Commit: `docs/graphics-pipeline/a2-after.jpg`

- [ ] **Step 1: Write the note**

Create `docs/graphics-a2-occlusion.md` in the pattern of `docs/graphics-a1-film.md`: an implementation section (pass placement and parameters, the prepass order, the seeded noise, the 70% ULTRA target with full-resolution depth UVs, the effects layer contract with the water exception, the volume depth clamp, `data-ambient-occlusion`, and that `data-triangles` and `data-draw-calls` now include the prepass at HIGH and ULTRA), then a "Local evidence (2026-09-16)" section with: the compare table (fifteen rows generated from `work/graphics-a2-diff/compare.json` in catalogue order, absolute error rounded and RMSE to three decimals), the occlusion walk findings from Task 3 Step 3, the probe table (five rows, ULTRA and HIGH samples and final tier), the frame-rate rule outcome from Task 3 Step 2, the check totals from Step 2 below, and the two images:

```markdown
Before, the A1 grade (see [the A1 note](graphics-a1-film.md)):

![All fifteen scenes at ULTRA before A2](graphics-pipeline/a1-after.jpg)

After:

![All fifteen scenes at ULTRA after A2](graphics-pipeline/a2-after.jpg)
```

- [ ] **Step 2: Run the full gate**

Run: `PLAYWRIGHT_CHANNEL=chrome npm run check 2>&1 | grep -E "Syntax checked|ℹ (pass|fail)|^OK|Built|passed|failed|exit"`
Expected: 17 dist modules syntax-checked, 111 unit tests passing, 10 certificate tests OK, the build, 11 Chromium and 3 WebKit tests passing. A camera-reset tolerance failure in the first Chromium test has been seen to be cold-run raster jitter; rerun that test alone before treating it as a regression.

- [ ] **Step 3: Commit the evidence**

```bash
git add docs/graphics-a2-occlusion.md docs/graphics-pipeline/a2-after.jpg
git diff --check --cached
git commit -F - <<'EOF'
docs: record A2 evidence: sheets, compare, probes and the occlusion walk

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch. The base branch is `codex/graphics-a1-film` (this work forked from A1's head `adbe951`); a pull request targets that branch so reviewers see only A2, and GitHub retargets it when A1 merges. Delete the parking branch only after the PR is open: `git branch -D wip/graphics-a2-occlusion`.
