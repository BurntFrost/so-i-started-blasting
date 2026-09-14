import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { deploymentUrl, validateRelease, projectId, repository } from './release-metadata.mjs';

export const releaseCheck = 'release-ready';
// The deployed catalogue module is inspected as text, never evaluated.
export const catalogueSize = source => new Set([...source.matchAll(/\{id:'([a-z0-9-]+)'/g)].map(match => match[1])).size;
const maxBytes = 1024 * 1024;
const requestTimeout = 15_000;
const knownErrors = /^(invalid-|release-|untrusted-|unsuccessful-|unexpected-|missing-|protected-|http-|response-|asset-|browser-|github-|oidc-)/;
const fail = code => { throw new Error(code); };

// Responses and credentials are never attached to thrown errors or written to reports.
export async function request(url, { headers = {}, method = 'GET', fetcher = fetch } = {}) {
  let response;
  try { response = await fetcher(url, { headers, method, redirect: 'manual', signal: AbortSignal.timeout(requestTimeout) }); }
  catch { fail('http-request-failed'); }
  if (response.status !== 200) fail(`http-status-${response.status}`);
  if (method === 'HEAD') return response;
  let length = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maxBytes) fail('response-too-large');
    chunks.push(chunk);
  }
  return { headers: response.headers, text: Buffer.concat(chunks).toString('utf8') };
}

export function eventRelease(event) {
  if (event.sender?.id !== 35613825 || event.sender?.login !== 'vercel[bot]'
    || event.repository?.full_name !== repository) fail('untrusted-event-source');
  const payload = event.client_payload;
  if (payload?.environment !== 'production' || payload.git?.ref !== 'main') fail('untrusted-release-branch');
  if (event.action !== 'vercel.deployment.ready' || !['ready', 'pending', 'success'].includes(payload.state?.type)) {
    fail('unsuccessful-deployment');
  }
  return validateRelease({ deploymentId: payload.id, url: payload.url, sha: payload.git.sha,
    projectId: payload.project?.id, environment: payload.environment });
}

export async function checkHosted(expected, { origin = expected.url, headers = {}, fetcher = fetch, browserSmoke } = {}) {
  expected = validateRelease(expected);
  if (origin !== expected.url) fail('invalid-probe-origin');
  const get = (path, method) => request(new URL(path, origin), { headers, method, fetcher });
  const identity = await get('/release.json');
  let metadata;
  try { metadata = JSON.parse(identity.text); } catch { fail('invalid-release-json'); }
  validateRelease(metadata, expected);
  const html = await get('/');
  if (!/So I Started Blasting/i.test(html.text) || !/id=["']world["']/.test(html.text)) fail('unexpected-page');
  const manifestResponse = await get('/asset-manifest.json');
  let manifest;
  try { manifest = JSON.parse(manifestResponse.text); } catch { fail('invalid-asset-manifest'); }
  const assets = Object.values(manifest);
  if (!assets.length || assets.length > 250 || !assets.every(asset => typeof asset === 'string'
    && /^\/immutable\/[a-zA-Z0-9_./-]+\.[a-f0-9]{16}\.(js|css|glb|webp|hdr|mp3)$/.test(asset)
    && !asset.includes('..'))) fail('invalid-asset-path');
  for (const extension of ['js', 'css', 'mp3', 'webp']) {
    if (!assets.some(asset => asset.endsWith(`.${extension}`))) fail(`missing-${extension}-asset`);
  }
  const entryAssets = [...html.text.matchAll(/(?:src|href)=["'](\/immutable\/[^"']+)["']/g)].map(match => match[1]);
  if (!entryAssets.length || !entryAssets.every(asset => assets.includes(asset.split('?')[0]))) fail('missing-entry-asset');
  for (let offset = 0; offset < assets.length; offset += 4) {
    await Promise.all(assets.slice(offset, offset + 4).map(async asset => {
      const response = await get(asset, 'HEAD');
      if (!response.headers.get('cache-control')?.includes('immutable')) fail('asset-cache-policy');
    }));
  }
  // The deployed revision decides how many cards its page must render: a ready dispatch can be
  // processed after a later main commit changed the catalogue in the workflow's own checkout.
  if (!manifest['/scenes.js']) fail('missing-scenes-module');
  const scenes = catalogueSize((await get(manifest['/scenes.js'])).text);
  if (!scenes) fail('invalid-scenes-module');
  if (browserSmoke) await browserSmoke(origin, headers, { scenes });
  return { ok: true, ...expected, origin, assets: assets.length, scenes,
    browser: Boolean(browserSmoke), checkedAt: new Date().toISOString(),
    manifestSha256: createHash('sha256').update(manifestResponse.text).digest('hex') };
}

export async function routeProtectedRequest(route, origin, headers) {
  const request = route.request();
  if (new URL(request.url()).origin !== origin) return route.abort();
  // Playwright can propagate overridden headers through redirects. Fetch exactly
  // one hop, and never give the browser a redirect that could carry credentials.
  try {
    const response = await route.fetch({ headers: { ...request.headers(), ...headers }, maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400) return route.abort();
    return route.fulfill({ response });
  } catch { return route.abort(); }
}

export async function smokeBrowser(origin, headers, { scenes }) {
  const { chromium } = await import('@playwright/test');
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 800, height: 700 }, hasTouch: true });
    await context.route('**/*', route => routeProtectedRequest(route, origin, headers));
    const page = await context.newPage();
    let errors = 0;
    page.on('pageerror', () => { errors++; });
    page.on('response', response => { if (response.url().includes('/immutable/') && response.status() >= 400) errors++; });
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => Number(document.querySelector('#world')?.dataset.drawCalls) > 0
      && document.querySelector('#loading')?.hidden, undefined, { timeout: 45_000 });
    if (await page.locator('.scene-card').count() !== scenes) fail('browser-scene-count');
    await page.locator('.scene-card[data-scene="1"]').click();
    await page.waitForFunction(() => document.querySelector('.scene-card[data-scene="1"]')?.getAttribute('aria-pressed') === 'true');
    if (errors || await page.locator('#error').isVisible()) fail('browser-render-failed');
  } catch { fail('browser-smoke-failed'); }
  finally { await browser?.close(); }
}

async function github(path, token, body) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(requestTimeout),
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) fail('github-request-failed');
  return response.json();
}

async function getOidcToken() {
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('missing-oidc-permission');
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set('audience', 'https://github.com/BurntFrost');
  const response = await request(url, { headers: { authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
  const token = JSON.parse(response.text).value;
  if (typeof token !== 'string' || token.split('.').length !== 3) fail('invalid-oidc-token');
  // Keep the short-lived credential inside this process, out of outputs and artifacts.
  return token;
}

export async function main(args = process.argv.slice(2)) {
  const phase = args[0];
  // The retired operator-completed artifact gate is rejected like any other unknown phase.
  if (phase !== 'ready') fail('invalid-release-phase');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const expected = eventRelease(event);
  const token = process.env.GITHUB_TOKEN;
  if (!token) fail('missing-github-token');
  // A production dispatch cannot authorize code or artifacts from an unmerged PR.
  const comparison = await github(`compare/${expected.sha}...main`, token);
  if (!['ahead', 'identical'].includes(comparison.status)) fail('untrusted-release-commit');
  const setStatus = state => github(`statuses/${expected.sha}`, token, {
    state, context: releaseCheck, description: `${state}: ${expected.deploymentId}`,
    target_url: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
  await setStatus('pending');
  try {
    const reports = [];
    const oidc = await getOidcToken();
    reports.push(await checkHosted(expected, { headers: { 'x-vercel-trusted-oidc-idp-token': oidc }, browserSmoke: smokeBrowser }));
    await setStatus('success');
    // Diagnostic only: production assignment is governed by the imported release-quality check.
    const report = { phase, checks: reports, dispatch: { senderId: event.sender.id, action: event.action } };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Release ${phase}\n\nDeployment: \`${expected.deploymentId}\`\n\nSHA: \`${expected.sha}\`\n\n${reports.length} hosted probes passed.\n`);
    return report;
  } catch (error) {
    await setStatus('failure').catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: knownErrors.test(error.message) ? error.message : 'release-check-failed' })}\n`);
    process.exitCode = 1;
  });
}
