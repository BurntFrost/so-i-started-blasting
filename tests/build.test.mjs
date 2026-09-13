import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from '../tools/build.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'blasting-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceDir = path.join(directory, 'dist');
  const outDir = path.join(directory, 'build');
  await mkdir(path.join(sourceDir, 'assets'), { recursive: true });
  await writeFile(path.join(sourceDir, 'index.html'), '<link href="/style.css?v=3"><script src="/boot.js?v=3"></script>');
  await writeFile(path.join(sourceDir, 'boot.js'), "import('./scene.js?v=3#entry'); const analytics = '/_vercel/insights/script.js';");
  await writeFile(path.join(sourceDir, 'scene.js'), "export const model = '/assets/city.glb';");
  await writeFile(path.join(sourceDir, 'style.css'), '.city { background: url(/assets/sky.webp) }');
  await writeFile(path.join(sourceDir, 'assets/city.glb'), 'model version one');
  await writeFile(path.join(sourceDir, 'assets/sky.webp'), 'sky texture');
  return { sourceDir, outDir };
}

test('clean builds are deterministic and all rewritten output URLs resolve', async t => {
  const options = await fixture(t);
  const first = await build(options);
  await writeFile(path.join(options.outDir, 'stale.js'), 'old');
  const second = await build(options);
  assert.deepEqual(first, second);
  await assert.rejects(readFile(path.join(options.outDir, 'stale.js')), { code: 'ENOENT' });
  for (const output of ['index.html', ...Object.values(second).map(url => url.slice(1))]) {
    const text = await readFile(path.join(options.outDir, output), 'utf8');
    for (const [url] of text.matchAll(/\/immutable\/[^"'`\s)<>?#]+/g)) {
      await assert.doesNotReject(readFile(path.join(options.outDir, url.slice(1))));
    }
  }
  const boot = await readFile(path.join(options.outDir, second['/boot.js']), 'utf8');
  assert.ok(boot.includes('/_vercel/insights/script.js'));
  assert.match(boot, /\/immutable\/scene\.[a-f0-9]{16}\.js\?v=3#entry/);
  const css = await readFile(path.join(options.outDir, second['/style.css']), 'utf8');
  assert.ok(css.includes(second['/assets/sky.webp']));
});

test('changing a model invalidates its importing scene and boot module only', async t => {
  const options = await fixture(t);
  const first = await build(options);
  await writeFile(path.join(options.sourceDir, 'assets/city.glb'), 'model version two');
  const second = await build(options);
  for (const source of ['/assets/city.glb', '/scene.js', '/boot.js']) assert.notEqual(first[source], second[source]);
  for (const source of ['/assets/sky.webp', '/style.css']) assert.equal(first[source], second[source]);
  const html = await readFile(path.join(options.outDir, 'index.html'), 'utf8');
  assert.ok(html.includes(second['/boot.js']));
});

test('missing assets and dynamic local paths fail before replacing a successful build', async t => {
  const options = await fixture(t);
  const first = await build(options);
  await writeFile(path.join(options.sourceDir, 'scene.js'), "export const model = '/assets/missing.glb';");
  await assert.rejects(build(options), /Missing local asset/);
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outDir, 'asset-manifest.json'), 'utf8')), first);
  await writeFile(path.join(options.sourceDir, 'scene.js'), 'export const model = `/assets/${name}.glb`;');
  await assert.rejects(build(options), /Use literal local asset URLs/);
});

test('Three engine and used addons are local, pinned, licensed and fingerprinted transitively', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.sourceDir, 'scene.js'), "import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; export {THREE,GLTFLoader};");
  const manifest = await build(options);
  const engine = manifest['/vendor/three/build/three.module.js'];
  const loader = manifest['/vendor/three/examples/jsm/loaders/GLTFLoader.js'];
  assert.ok(engine && loader);
  const scene = await readFile(path.join(options.outDir, manifest['/scene.js']), 'utf8');
  assert.ok(scene.includes(engine) && scene.includes(loader));
  const loaderSource = await readFile(path.join(options.outDir, loader), 'utf8');
  assert.ok(loaderSource.includes(engine));
  assert.ok(loaderSource.includes(manifest['/vendor/three/examples/jsm/utils/BufferGeometryUtils.js']));
  assert.match(await readFile(path.join(options.outDir, 'vendor/three/LICENSE'), 'utf8'), /MIT License/);
  assert.equal(await readFile(path.join(options.outDir, 'vendor/three/VERSION'), 'utf8'), '0.170.0\n');
  assert.deepEqual((await readdir(path.dirname(options.outDir))).sort(), ['build', 'dist']);
});

test('cycles, unsupported package paths and overlapping output fail without losing the previous build', async t => {
  const options = await fixture(t);
  const first = await build(options);
  await writeFile(path.join(options.sourceDir, 'scene.js'), "import './boot.js';");
  await assert.rejects(build(options), /Circular local asset dependency/);
  await writeFile(path.join(options.sourceDir, 'scene.js'), "import 'three/unexpected.js';");
  await assert.rejects(build(options), /Unsupported package import/);
  await assert.rejects(build({ ...options, outDir: options.sourceDir }), /must be separate/);
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outDir, 'asset-manifest.json'), 'utf8')), first);
});
