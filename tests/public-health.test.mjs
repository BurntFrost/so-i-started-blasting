import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPublic } from '../tools/check-public.mjs';

function fixture(overrides = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    const path = new URL(url).pathname;
    if (overrides[url]) return overrides[url]();
    if (url.includes('vercel.app')) return new Response(null, { status: 302, headers: { location: 'https://vercel.com/sso-api?secret=must-not-appear' } });
    if (url.includes('_vercel_share')) return new Response(null, { status: 403 });
    if (path === '/asset-manifest.json') return Response.json({ '/boot.js': '/immutable/boot.0123456789abcdef.js' });
    if (path.endsWith('.js')) return new Response('export {};', { headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=31536000, immutable' } });
    return new Response('<canvas id="world"></canvas>', { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'content-security-policy': "object-src 'none'", 'cache-control': 'public, max-age=0, must-revalidate' } });
  };
}

test('public checks cover headers, hashed assets, provider delivery, and origin isolation', async () => {
  const report = await checkPublic({ fetchImpl: fixture() });
  assert.equal(report.ok, true);
  assert.equal(report.results.length, 7);
  assert.ok(!JSON.stringify(report).includes('secret'));
});

test('reachable public origin, missing CSP, and an external manifest URL fail closed', async () => {
  const report = await checkPublic({ fetchImpl: fixture({
    'https://so-i-started-blasting.vercel.app/': () => new Response('public origin'),
    'https://soistartedblasting.com/': () => new Response('<canvas id="world"></canvas>', { headers: { 'content-type': 'text/html' } }),
    'https://soistartedblasting.com/asset-manifest.json': () => Response.json({ '/boot.js': 'https://unrelated.invalid/app.js' }),
  }) });
  assert.equal(report.ok, false);
  assert.deepEqual(report.results.filter(result => !result.ok).map(result => result.name), ['soistartedblasting.com:page', 'hashed-asset', 'origin-protection']);
});

test('network failures produce bounded diagnostics without leaking response URLs', async () => {
  const report = await checkPublic({ fetchImpl: async () => { throw new Error('private diagnostic with token'); } });
  assert.equal(report.ok, false);
  assert.equal(report.results.length, 7);
  assert.ok(!JSON.stringify(report).includes('token'));
});
