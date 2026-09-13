import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseMetadata, projectId, repository, validateRelease } from '../tools/release-metadata.mjs';
import { checkHosted, eventRelease, main, request, routeProtectedRequest } from '../tools/check-deployment.mjs';

const release = { deploymentId: 'dpl_abc123', url: 'https://so-i-started-blasting-abcdef123-burntfrosts-projects.vercel.app',
  sha: 'a'.repeat(40), projectId, environment: 'production' };
const assets = Object.fromEntries(['js', 'css', 'webp', 'mp3'].map(extension => [`/file.${extension}`, `/immutable/file.${'a'.repeat(16)}.${extension}`]));
const event = () => ({ action: 'vercel.deployment.ready', sender: { login: 'vercel[bot]', id: 35613825 },
  repository: { full_name: repository }, client_payload: { id: release.deploymentId, url: release.url,
    git: { sha: release.sha, ref: 'main' }, project: { id: projectId }, environment: 'production', state: { type: 'pending' } } });
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers });
function fixture({ metadata = release, missingAsset = false, protectedOrigin = false, manifest = assets } = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'manual');
    const path = new URL(url).pathname;
    if (protectedOrigin) return response('sign in', 302, { location: 'https://vercel.com/sso-api' });
    if (path === '/release.json') return response(JSON.stringify(metadata));
    if (path === '/asset-manifest.json') return response(JSON.stringify(manifest));
    if (path === '/') return response(`<title>So I Started Blasting</title><canvas id="world"></canvas><script src="${assets['/file.js']}"></script>`);
    return missingAsset ? response('', 404) : response('', 200, { 'cache-control': 'public, max-age=31536000, immutable' });
  };
}

test('Vercel build emits only required nonsecret identity; local builds emit none', () => {
  assert.equal(createReleaseMetadata({}), null);
  assert.deepEqual(createReleaseMetadata({ VERCEL: '1', VERCEL_DEPLOYMENT_ID: release.deploymentId,
    VERCEL_URL: new URL(release.url).host, VERCEL_GIT_COMMIT_SHA: release.sha,
    VERCEL_PROJECT_ID: projectId, VERCEL_ENV: 'production', SECRET: 'do-not-emit' }), release);
  assert.throws(() => createReleaseMetadata({ VERCEL: '1' }));
});

test('release identity rejects another deployment, SHA, project, and mutable or credential URLs', () => {
  for (const metadata of [{ ...release, deploymentId: 'dpl_other' }, { ...release, sha: 'b'.repeat(40) },
    { ...release, projectId: 'prj_other' }, { ...release, url: 'https://so-i-started-blasting.vercel.app' },
    { ...release, url: `${release.url}/?token=private` }, { ...release, url: release.url.replace('https://', 'https://secret@') }]) {
    assert.throws(() => validateRelease(metadata, release));
  }
});

test('only trusted production main dispatches can authorize a hosted check', () => {
  assert.deepEqual(eventRelease(event()), release);
  for (const mutate of [e => e.sender.id = 1, e => e.repository.full_name = 'attacker/repo',
    e => e.client_payload.git.ref = 'pull/1/head', e => e.client_payload.environment = 'preview',
    e => e.client_payload.state.type = 'failed', e => delete e.client_payload.state,
    e => e.action = 'vercel.deployment.success', e => e.action = 'vercel.deployment.promoted']) {
    const untrusted = event(); mutate(untrusted);
    assert.throws(() => eventRelease(untrusted));
  }
});

test('hosted smoke checks identity before page/assets and includes the browser result', async () => {
  let rendered = false;
  const result = await checkHosted(release, { fetcher: fixture(), browserSmoke: async origin => { assert.equal(origin, release.url); rendered = true; } });
  assert.equal(result.ok, true);
  assert.equal(result.assets, 4);
  assert.equal(rendered, true);
});

test('hosted smoke fails for SHA/deployment mismatch, missing asset, or protected origin', async () => {
  for (const options of [{ metadata: { ...release, sha: 'b'.repeat(40) } },
    { metadata: { ...release, deploymentId: 'dpl_other' } }, { missingAsset: true }, { protectedOrigin: true }]) {
    await assert.rejects(checkHosted(release, { fetcher: fixture(options) }));
  }
});

test('metadata cannot redirect authenticated probes to another host or an unhashed asset', async () => {
  await assert.rejects(checkHosted(release, { origin: 'https://attacker.example', fetcher: fixture() }));
  await assert.rejects(checkHosted(release, { fetcher: fixture({ manifest: { ...assets, '/external.js': 'https://attacker.example/file.js' } }) }));
  for (const origin of ['https://soistartedblasting.com', 'https://www.soistartedblasting.com']) {
    await assert.rejects(checkHosted(release, { origin, fetcher: fixture() }), /invalid-probe-origin/);
  }
});

test('retired public and operator-completion phases are rejected before reading event or credentials', async () => {
  for (const phase of ['public', 'complete']) await assert.rejects(main([phase, '123']), /invalid-release-phase/);
});

test('HTTP errors redact remote bodies, redirects, and thrown credential diagnostics', async () => {
  await assert.rejects(request(release.url, { fetcher: async () => response('secret-body', 403) }), /^Error: http-status-403$/);
  await assert.rejects(request(release.url, { fetcher: async () => { throw new Error('secret-token'); } }), /^Error: http-request-failed$/);
  await assert.rejects(request(release.url, { fetcher: async () => response('x'.repeat(1024 * 1024 + 1)) }), /response-too-large/);
});

test('protected browser requests abort redirects and external destinations before credentials can follow', async () => {
  for (const status of [200, 302, 307]) {
    const calls = [];
    const route = { request: () => ({ url: () => release.url, headers: () => ({ accept: '*/*' }) }),
      fetch: async options => { calls.push('fetch'); assert.equal(options.maxRedirects, 0);
        assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'], 'test-token'); return { status: () => status }; },
      abort: async () => calls.push('abort'), fulfill: async () => calls.push('fulfill') };
    await routeProtectedRequest(route, release.url, { 'x-vercel-trusted-oidc-idp-token': 'test-token' });
    assert.deepEqual(calls, ['fetch', status === 200 ? 'fulfill' : 'abort']);
    route.request = () => ({ url: () => 'https://external.example/path' });
    calls.length = 0;
    await routeProtectedRequest(route, release.url, { 'x-vercel-trusted-oidc-idp-token': 'test-token' });
    assert.deepEqual(calls, ['abort']);
  }
});
