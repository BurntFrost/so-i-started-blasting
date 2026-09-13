import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/analytics.js', import.meta.url), 'utf8');
function bootstrap({ hostname = 'example.vercel.app', navigator = {}, window = {} } = {}) {
  const scripts = [];
  const context = { window, navigator, URL, location: { hostname, href: `https://${hostname}/` },
    document: { createElement: () => ({}), head: { append: script => scripts.push(script) } } };
  vm.runInNewContext(source, context);
  return { window, scripts };
}

test('production bootstrap queues events and strips query strings and fragments', () => {
  const { window, scripts } = bootstrap();
  assert.equal(scripts.length, 2);
  assert.equal(scripts[0].src, '/_vercel/insights/script.js');
  assert.equal(scripts[1].src, '/_vercel/speed-insights/script.js');
  const beforeSend = window.vaq[0][1];
  assert.equal(beforeSend({ url: 'https://example.vercel.app/?private=value#fragment' }).url, 'https://example.vercel.app/');
  window.va('event', { name: 'Scene Ready', data: { scene: 'melancholia', ready_ms: 12 } });
  assert.equal(window.vaq[1][0], 'event');
});

test('local development and privacy opt-outs do not load analytics', () => {
  for (const options of [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }, { hostname: '[::1]' },
    { navigator: { globalPrivacyControl: true } }, { navigator: { doNotTrack: '1' } }, { window: { doNotTrack: '1' } }]) {
    const { window, scripts } = bootstrap(options);
    assert.equal(scripts.length, 0);
    assert.equal(window.va, undefined);
  }
});

test('a blocked or unavailable analytics script releases its queue', () => {
  const { window, scripts } = bootstrap();
  scripts[0].onerror();
  assert.equal(window.vaq.length, 0);
  assert.doesNotThrow(() => window.va('event', { name: 'Scene Ready' }));
  scripts[1].onerror();
  assert.equal(window.siq.length, 0);
  assert.doesNotThrow(() => window.si('event', { name: 'Test' }));
});
