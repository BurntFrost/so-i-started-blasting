import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';
import { build } from '../tools/build.mjs';

// `three.module.js` prints this prefix in its renderer diagnostics; neither
// `three.webgpu.js` nor the shared `three.core.js` contains it, and minification
// cannot rewrite a string literal. Pass classes survive because the bundler keeps names.
const CLASSIC_ENGINE = 'THREE.WebGLRenderer:';
// `UnrealBloomPass` is not usable as a marker: the node pipeline's BloomNode is a port
// of it and keeps its render-target names. These four have no node-path counterpart.
const CLASSIC_PASSES = ['EffectComposer', 'GTAOPass', 'FullScreenQuad', 'LuminosityHighPassShader'];
// Every visitor reaches the renderer through boot's catchable dynamic import, so
// reachability alone cannot separate the payload from the opt-in comparison path.
// The classic runtime is the boundary: code only it can reach is never fetched
// without `?renderer=classic`.
const BOUNDARY = '/classic-runtime.js';

async function buildOnce(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'blasting-engine-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outDir = path.join(directory, 'build');
  const manifest = await build({ outDir });
  await init;
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const entry = html.match(/<script type="module" src="([^"]+)"/)?.[1];
  assert.ok(entry, 'the built HTML declares a module entry');
  return { outDir, manifest, entry };
}

async function reachable(outDir, roots, { stopAt = [] } = {}) {
  const seen = new Map();
  const queue = [...roots];
  const blocked = new Set(stopAt);
  while (queue.length) {
    const url = queue.pop();
    if (!url || seen.has(url) || blocked.has(url) || !url.endsWith('.js')) continue;
    const text = await readFile(path.join(outDir, url), 'utf8');
    seen.set(url, text);
    for (const record of parse(text)[0]) if (record.specifier) queue.push(record.specifier);
  }
  return seen;
}

test('the classic WebGL engine and its passes never reach the default payload', async t => {
  const { outDir, manifest, entry } = await buildOnce(t);
  const boundary = manifest[BOUNDARY];
  assert.ok(boundary, `${BOUNDARY} is emitted as its own module URL`);

  const payload = await reachable(outDir, [entry], { stopAt: [boundary] });
  assert.ok(payload.size > 5, 'the default payload resolved past the entry');

  for (const marker of [CLASSIC_ENGINE, ...CLASSIC_PASSES]) {
    const carriers = [...payload].filter(([, text]) => text.includes(marker)).map(([url]) => url);
    assert.deepEqual(carriers, [], `no default-payload module carries ${marker}`);
  }
});

test('the classic renderer stays intact behind that boundary', async t => {
  const { outDir, manifest } = await buildOnce(t);
  const classic = await reachable(outDir, [manifest[BOUNDARY]]);
  const text = [...classic.values()].join('\n');
  for (const marker of [CLASSIC_ENGINE, ...CLASSIC_PASSES]) {
    assert.ok(text.includes(marker), `${marker} is still emitted for ?renderer=classic`);
  }
});

test('the default payload keeps the node renderer and its always-loaded addons', async t => {
  const { outDir, manifest, entry } = await buildOnce(t);
  const payload = await reachable(outDir, [entry], { stopAt: [manifest[BOUNDARY]] });
  const text = [...payload.values()].join('\n');
  for (const marker of ['OrbitControls', 'GLTFLoader', 'HDRLoader', 'WebGPURenderer']) {
    assert.ok(text.includes(marker), `${marker} stays in the default payload`);
  }
});

test('an addon pulled into both engine realms fails the build instead of mixing engines', async () => {
  const { vendorThree } = await import('../tools/vendor.mjs');
  const addon = "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';";

  // One realm each: the shared addon resolves to whichever engine reached it.
  const nodeOnly = new Map([['a.js', Buffer.from(`import * as T from 'three/webgpu';${addon}console.log(T,OrbitControls);`)]]);
  await vendorThree(nodeOnly);
  const controls = 'vendor/three/examples/jsm/controls/OrbitControls.js';
  assert.match(nodeOnly.get(controls).toString(), /three\.webgpu\.js/, 'the node realm gets the WebGPU engine');
  assert.ok(!nodeOnly.has('vendor/three/build/three.module.js'), 'the classic engine is not vendored at all');

  const classicOnly = new Map([['a.js', Buffer.from(`import * as T from 'three';${addon}console.log(T,OrbitControls);`)]]);
  await vendorThree(classicOnly);
  assert.match(classicOnly.get(controls).toString(), /three\.module\.js/, 'the classic realm gets the WebGL engine');

  // Both realms reaching one addon would silently mix two engine builds.
  const mixed = new Map([
    ['node.js', Buffer.from(`import * as T from 'three/webgpu';${addon}console.log(T,OrbitControls);`)],
    ['classic.js', Buffer.from(`import * as T from 'three';${addon}console.log(T,OrbitControls);`)],
  ]);
  await assert.rejects(vendorThree(mixed), /reached from both the classic and node engine realms/);
});
