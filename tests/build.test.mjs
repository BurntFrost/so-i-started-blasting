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
  return { sourceDir, outDir, optimize: false };
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

test('audio is fingerprinted and changing a soundtrack invalidates its importing module', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.sourceDir, 'assets/score.mp3'), 'original score');
  await writeFile(path.join(options.sourceDir, 'scene.js'), "export const audio = '/assets/score.mp3';");
  const first = await build(options);
  assert.match(first['/assets/score.mp3'], /\/immutable\/assets\/score\.[a-f0-9]{16}\.mp3$/);
  await writeFile(path.join(options.sourceDir, 'assets/score.mp3'), 'new score');
  const second = await build(options);
  for (const source of ['/assets/score.mp3', '/scene.js', '/boot.js']) assert.notEqual(first[source], second[source]);
  const scene = await readFile(path.join(options.outDir, second['/scene.js']), 'utf8');
  assert.ok(scene.includes(second['/assets/score.mp3']));
  await writeFile(path.join(options.sourceDir, 'scene.js'), "export const audio = '/assets/missing.mp3';");
  await assert.rejects(build(options), /Missing local asset/);
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

for (const expression of [
  '`/assets/${name}`', '`/assets/${name || "fallback"}`',
  "'/assets/' + name + '.mp3'", "'/assets/' /* track */ + name + '.mp3'",
  "import('./' + name + '.js')", "import(('./') + name + '.js')",
  "('/assets/') + name + '.mp3'", "(( /* prefix */ '/assets/' /* end */ )) + name + '.mp3'",
  "('/assets/' + name + '.mp3')",
  "prefix + '/assets/' + name + '.mp3'",
  "('https://example.com' && prefix) + '/assets/' + name",
  "('https://example.com' ? prefix : alternate) + '/assets/' + name",
  "('https://example.com' ? '/assets/' : '/fallback/') + name + '.mp3'"
]) {
  test(`computed local reference ${expression} fails without replacing the previous build`, async t => {
    const options = await fixture(t);
    const first = await build(options);
    const html = await readFile(path.join(options.outDir, 'index.html'), 'utf8');
    await writeFile(path.join(options.sourceDir, 'scene.js'), `export const asset = ${expression};`);
    await assert.rejects(build(options), /Use literal local asset URLs/);
    assert.deepEqual(JSON.parse(await readFile(path.join(options.outDir, 'asset-manifest.json'), 'utf8')), first);
    assert.equal(await readFile(path.join(options.outDir, 'index.html'), 'utf8'), html);
  });
}

test('external, data and request-time provider paths remain unchanged', async t => {
  const options = await fixture(t);
  const html = '<link rel="icon" href="data:image/svg+xml,%3Csvg fill=\'%23f90\'/%3E"><script src="/boot.js"></script>';
  await writeFile(path.join(options.sourceDir, 'index.html'), html);
  const references = [
    '`https://example.com/assets/${name}.mp3`',
    "'https://example.com/assets/' + name + '.mp3'",
    "'https://example.com' + /* separator */ '/asset.js'",
    "('https://example.com' + name) + (/* separator */ '/asset.js')",
    "('https://example.com' + (flag ? first : second)) + '/asset.js'",
    "'https://example.com' + // separator\n '/asset.js'",
    '`//example.com/assets/${name}.mp3`',
    "'data:audio/mpeg;base64,' + bytes",
    "'/_vercel/' + name + '/script.js'",
    "('/_vercel/' + name) + /* separator */ ('/script.js')",
    '`/_vercel/${name}/script.js`'
  ];
  const text = `export const assets = [${references.join(',')}];`;
  await writeFile(path.join(options.sourceDir, 'scene.js'), text);
  const manifest = await build(options);
  assert.equal(await readFile(path.join(options.outDir, manifest['/scene.js']), 'utf8'), text);
  assert.ok((await readFile(path.join(options.outDir, 'index.html'), 'utf8')).includes("data:image/svg+xml,%3Csvg fill='%23f90'/%3E"));
});

test('grouped literal assets still rewrite around comments, regexes and unrelated strings', async t => {
  const options = await fixture(t);
  const text = [
    '// A comment\'s "/assets/missing.mp3" is not a runtime reference.',
    'const quoted = /["\']/; if (enabled) /["\']/.test(input);',
    'const ratio = 12 / 3;',
    'const note = "not a \'/assets/missing.mp3\' reference";',
    'export const model = ((/* grouping */ "/assets/city.glb"));'
  ].join('\n');
  await writeFile(path.join(options.sourceDir, 'scene.js'), text);
  const manifest = await build(options);
  const output = await readFile(path.join(options.outDir, manifest['/scene.js']), 'utf8');
  assert.equal(output, text.replace('"/assets/city.glb"', `"${manifest['/assets/city.glb']}"`));
});

test('release identity is staged atomically without changing static asset hashes', async t => {
  const options = await fixture(t);
  const first = await build(options);
  const previousEnv = process.env;
  t.after(() => { process.env = previousEnv; });
  process.env = { ...process.env, VERCEL: '1', VERCEL_DEPLOYMENT_ID: 'dpl_fixture123',
    VERCEL_URL: 'so-i-started-blasting-abc123xyz-burntfrosts-projects.vercel.app',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_PROJECT_ID: 'prj_t9xPKJ22rXL1adwZON1A1FH4pWr6', VERCEL_ENV: 'preview' };
  assert.deepEqual(await build(options), first);
  const release = JSON.parse(await readFile(path.join(options.outDir, 'release.json'), 'utf8'));
  assert.equal(release.deploymentId, 'dpl_fixture123');
  assert.equal(release.sha, 'a'.repeat(40));
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  await assert.rejects(build(options), /invalid-release-metadata/);
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outDir, 'release.json'), 'utf8')), release);
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outDir, 'asset-manifest.json'), 'utf8')), first);
  await writeFile(path.join(options.sourceDir, 'release.json'), '{}');
  await assert.rejects(build(options), /reserved for deployment identity/);
});

test('Three engine and used addons are local, pinned, licensed and fingerprinted transitively', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.sourceDir, 'scene.js'), "import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'; export {THREE,GLTFLoader,HDRLoader};");
  const manifest = await build(options);
  const engine = manifest['/vendor/three/build/three.module.js'];
  const loader = manifest['/vendor/three/examples/jsm/loaders/GLTFLoader.js'];
  const core = manifest['/vendor/three/build/three.core.js'];
  const hdrLoader = manifest['/vendor/three/examples/jsm/loaders/HDRLoader.js'];
  assert.ok(engine && core && loader && hdrLoader);
  const engineSource = await readFile(path.join(options.outDir, engine), 'utf8');
  assert.ok(engineSource.includes(core), 'engine references the fingerprinted core module');
  assert.ok(!engineSource.includes("from './three.core.js'"));
  const scene = await readFile(path.join(options.outDir, manifest['/scene.js']), 'utf8');
  assert.ok(scene.includes(engine) && scene.includes(loader) && scene.includes(hdrLoader));
  const hdrSource = await readFile(path.join(options.outDir, hdrLoader), 'utf8');
  assert.ok(hdrSource.includes(engine), 'HDR loader references the fingerprinted engine');
  const loaderSource = await readFile(path.join(options.outDir, loader), 'utf8');
  assert.ok(loaderSource.includes(engine));
  assert.ok(loaderSource.includes(manifest['/vendor/three/examples/jsm/utils/BufferGeometryUtils.js']));
  assert.match(await readFile(path.join(options.outDir, 'vendor/three/LICENSE'), 'utf8'), /MIT License/);
  assert.equal(await readFile(path.join(options.outDir, 'vendor/three/VERSION'), 'utf8'), '0.186.0\n');
  assert.deepEqual((await readdir(path.dirname(options.outDir))).sort(), ['build', 'dist']);
});

test('node renderer and TSL graph are fingerprinted without treating shader comments as URLs', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.sourceDir, 'scene.js'), "export { WebGPURenderer } from 'three/webgpu'; export { Fn } from 'three/tsl';");
  const manifest = await build(options);
  const engine = manifest['/vendor/three/build/three.webgpu.js'];
  const core = manifest['/vendor/three/build/three.core.js'];
  const tsl = manifest['/vendor/three/build/three.tsl.js'];
  assert.ok(engine && core && tsl);
  assert.ok((await readFile(path.join(options.outDir, engine), 'utf8')).includes(core));
  assert.ok((await readFile(path.join(options.outDir, tsl), 'utf8')).includes(engine));
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
