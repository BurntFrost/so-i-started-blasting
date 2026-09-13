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
  assert.ok(scripts.every(script => script.defer === true));
  for (const queue of [window.vaq, window.siq]) {
    assert.equal(queue[0][0], 'beforeSend');
    const beforeSend = queue[0][1];
    const event = { url: 'https://example.vercel.app/?private=value#fragment', name: 'CLS', value: 0.1 };
    const sanitized = beforeSend(event);
    assert.equal(sanitized.url, 'https://example.vercel.app/');
    assert.equal(sanitized.name, event.name);
    assert.equal(sanitized.value, event.value);
    assert.equal(event.url, 'https://example.vercel.app/?private=value#fragment');
  }
  window.va('event', { name: 'Scene Ready', data: { scene: 'melancholia', ready_ms: 12 } });
  assert.equal(window.vaq[1][0], 'event');
});

test('local development and privacy opt-outs do not load analytics', () => {
  for (const options of [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }, { hostname: '[::1]' },
    { navigator: { globalPrivacyControl: true } }, { navigator: { doNotTrack: '1' } }, { window: { doNotTrack: '1' } }]) {
    const { window, scripts } = bootstrap(options);
    assert.equal(scripts.length, 0);
    assert.equal(window.va, undefined);
    assert.equal(window.si, undefined);
    assert.equal(window.siq, undefined);
  }
});

test('Speed Insights vital hooks sanitize the event shape used by the served collector', () => {
  const { window } = bootstrap();
  const sanitize = window.siq[0][1];
  const event = { type: 'vital', url: 'https://example.vercel.app/?probe=private#fragment', route: '/' };
  assert.deepEqual(JSON.parse(JSON.stringify(sanitize(event))), { type: 'vital', url: 'https://example.vercel.app/', route: '/' });
  assert.equal(event.url, 'https://example.vercel.app/?probe=private#fragment');
});

test('a blocked analytics script releases only its own queue', () => {
  for (const [index, name, other] of [[0, 'va', 'si'], [1, 'si', 'va']]) {
    const { window, scripts } = bootstrap();
    scripts[index].onerror();
    assert.equal(window[`${name}q`].length, 0);
    assert.doesNotThrow(() => window[name]('beforeSend', () => null));
    assert.equal(window[`${name}q`].length, 0);
    assert.equal(window[`${other}q`].length, 1);
    window[other]('beforeSend', () => null);
    assert.equal(window[`${other}q`].length, 2);
  }
});
