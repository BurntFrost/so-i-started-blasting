import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { init, parse } from 'es-module-lexer';
import { build } from '../tools/build.mjs';

test('optimized modules share code, remove unused vendor exports, and retain transitive content hashes', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'blasting-bundle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourceDir = path.join(directory, 'dist'), outDir = path.join(directory, 'build');
  await mkdir(path.join(sourceDir, 'vendor'), { recursive: true });
  await mkdir(path.join(sourceDir, 'assets'));
  await writeFile(path.join(sourceDir, 'index.html'), '<link rel="modulepreload" href="/first.js?v=3"><script type="module" src="/boot.js?v=3"></script>');
  await writeFile(path.join(sourceDir, 'boot.js'), "import('./first.js?v=3'); import('./second.js?v=3');");
  await writeFile(path.join(sourceDir, 'first.js'), "export { value } from './vendor/shared.js';");
  await writeFile(path.join(sourceDir, 'second.js'), "export { value } from './vendor/shared.js';");
  await writeFile(path.join(sourceDir, 'vendor/shared.js'), "export const value = { sky: '/assets/sky.webp', id: Math.random() }; export function unused() { return 'UNUSED_VENDOR_SENTINEL'; }");
  await writeFile(path.join(sourceDir, 'assets/sky.webp'), 'sky version one');
  const manifest = await build({ sourceDir, outDir });
  assert.deepEqual(await build({ sourceDir, outDir }), manifest);
  assert.ok(!manifest['/vendor/shared.js']);
  await init;
  const scripts = [];
  for (const url of Object.values(manifest)) {
    const bytes = await readFile(path.join(outDir, url));
    assert.ok(url.includes(createHash('sha256').update(bytes).digest('hex').slice(0, 16)), 'hash covers emitted bytes');
    if (!url.endsWith('.js')) continue;
    const text = bytes.toString(); scripts.push(text);
    for (const entry of parse(text)[0]) {
      assert.ok(Object.values(manifest).includes(entry.specifier), `canonical import ${entry.specifier}`);
      await readFile(path.join(outDir, entry.specifier));
    }
  }
  assert.equal(scripts.filter(text => text.includes('Math.random()')).length, 1, 'shared module initializes once');
  assert.ok(!scripts.some(text => text.includes('UNUSED_VENDOR_SENTINEL')));
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.ok(html.includes(manifest['/first.js']) && !html.includes('?v=3'));
  await writeFile(path.join(sourceDir, 'assets/sky.webp'), 'sky version two');
  const changed = await build({ sourceDir, outDir });
  for (const name of ['/assets/sky.webp', '/first.js', '/second.js', '/boot.js']) assert.notEqual(manifest[name], changed[name]);
  await writeFile(path.join(sourceDir, 'first.js'), "export const missing = '/assets/missing.webp';");
  await assert.rejects(build({ sourceDir, outDir }), /Missing local asset/);
  assert.deepEqual(JSON.parse(await readFile(path.join(outDir, 'asset-manifest.json'), 'utf8')), changed);
});
