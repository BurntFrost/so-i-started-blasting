import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');

function links(html) {
  return [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => Object.fromEntries(
    [...tag.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, value ?? true])
  ));
}

async function importSuffix(module, specifier) {
  const text = await readFile(path.join(dist, module), 'utf8');
  const match = text.match(new RegExp(`['"]\\./${specifier.replace('.', '\\.')}(\\?[^'"#]*)?['"]`));
  assert.ok(match, `${module} should import ${specifier}`);
  return match[1] ?? '';
}

test('the first-scene module chain and its models are preloaded with matching URLs', async () => {
  const html = await readFile(path.join(dist, 'index.html'), 'utf8');
  const modulepreloads = links(html).filter(link => link.rel === 'modulepreload').map(link => link.href);
  // Browsers only discover each import level after parsing the previous one; hints flatten the chain.
  for (const [importer, module] of [['boot.js', 'simulation.js'], ['simulation.js', 'cinema.js'], ['simulation.js', 'production.js']]) {
    const expected = `/${module}${await importSuffix(importer, module)}`;
    assert.ok(modulepreloads.includes(expected), `expected modulepreload ${expected}, got ${modulepreloads}`);
  }
  assert.ok(modulepreloads.includes('/vendor/three/build/three.module.js'));
  // Models load only after the first procedural frame, so they preload at low priority
  // instead of competing with the engine download before that frame. rel=prefetch is the
  // wrong hint twice over: it announces a future navigation rather than this one, and a
  // CDN speculation gate refuses any Sec-Purpose: prefetch it has not cached, with a 503.
  const fetches = links(html).filter(link => link.rel === 'preload' && link.as === 'fetch');
  for (const model of ['/assets/city-kit.glb', '/assets/mothership.glb']) {
    const hint = fetches.find(link => link.href === model);
    assert.ok(hint, `expected fetch preload for ${model}`);
    assert.equal(hint.fetchpriority, 'low', `${model} must not outrank the engine download`);
    // Three's FileLoader fetches in CORS mode; an uncredentialed hint would be discarded.
    assert.equal(hint.crossorigin, true);
    await access(path.join(dist, model.slice(1)));
  }
  const production = await readFile(path.join(dist, 'production.js'), 'utf8');
  for (const { href } of fetches) assert.ok(production.includes(`'${href}'`), `${href} is not loaded by production.js`);
});

test('preload hints are fingerprinted and resolve inside the built output', async t => {
  const outDir = path.join(await mkdtemp(path.join(tmpdir(), 'blasting-preload-')), 'build');
  t.after(() => rm(path.dirname(outDir), { recursive: true, force: true }));
  const manifest = await build({ outDir });
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const hints = links(html).filter(link => ['modulepreload', 'preload'].includes(link.rel));
  assert.ok(hints.length >= 6);
  for (const { href } of hints) {
    const [pathname, suffix = ''] = href.split(/(?=\?)/);
    assert.match(pathname, /^\/immutable\//, `${href} should be fingerprinted`);
    await access(path.join(outDir, pathname.slice(1)));
    const source = Object.entries(manifest).find(([, output]) => output === pathname)?.[0];
    assert.ok(source, `${pathname} should come from the manifest`);
    // The hint must be byte-identical to the importer's URL, including any cache-busting suffix.
    if (source === '/simulation.js') {
      const boot = await readFile(path.join(outDir, manifest['/boot.js']), 'utf8');
      assert.ok(boot.includes(`${pathname}${suffix}`));
    }
  }
});
