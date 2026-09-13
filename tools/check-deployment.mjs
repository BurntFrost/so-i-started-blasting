import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { deploymentUrl, validateRelease, projectId, repository } from './release-metadata.mjs';

export const releaseCheck = 'release-ready';
export const artifactCheck = 'release-artifact';
const teamId = 'team_jMtyP7WFqokDZDezN3QVX63o';
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
  if (browserSmoke) await browserSmoke(origin, headers);
  return { ok: true, ...expected, origin, assets: assets.length,
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

export async function smokeBrowser(origin, headers) {
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
    if (await page.locator('.scene-card').count() !== 10) fail('browser-scene-count');
    await page.locator('.scene-card[data-scene="1"]').click();
    await page.waitForFunction(() => document.querySelector('.scene-card[data-scene="1"]')?.getAttribute('aria-pressed') === 'true');
    if (errors || await page.locator('#error').isVisible()) fail('browser-render-failed');
  } catch { fail('browser-smoke-failed'); }
  finally { await browser?.close(); }
}

export function selectArtifactRun(runs, expected, checkId) {
  const matches = runs.filter(run => run.checkId === checkId);
  if (matches.length !== 1) fail('release-artifact-run-count');
  const run = matches[0];
  if (!/^ckr_[a-zA-Z0-9-]+$/.test(run.id) || run.name !== artifactCheck
    || run.projectId !== projectId || run.deploymentId !== expected.deploymentId
    || run.ownerId !== teamId || run.source?.kind !== 'webhook'
    || run.blocks !== 'deployment-alias' || run.requires !== 'build-ready'
    || !run.targets?.includes('production')) fail('release-artifact-run-mismatch');
  if (!['queued', 'running'].includes(run.status)) fail('release-artifact-run-already-completed');
  return run;
}

export async function startArtifactCheck(expected, { checkId, apiCaller: api } = {}) {
  if (!api || !/^chk_[a-zA-Z0-9-]+$/.test(checkId)) fail('missing-artifact-gate-credential');
  // A cached GitHub success for this SHA cannot replace the run for this deployment.
  const deployment = await api(`/v13/deployments/${expected.deploymentId}`);
  validateRelease({ deploymentId: deployment.id, url: `https://${deployment.url}`,
    sha: deployment.meta?.githubCommitSha, projectId: deployment.projectId,
    environment: deployment.target }, expected);
  if (deployment.readyState !== 'READY') fail('unsuccessful-artifact-build');
  const path = `/v2/deployments/${expected.deploymentId}/check-runs`;
  const run = selectArtifactRun((await api(path)).runs, expected, checkId);
  await api(`${path}/${run.id}`, { status: 'running', externalId: `${expected.deploymentId}:${expected.sha}` });
  return async (conclusion, report) => {
    await api(`${path}/${run.id}`, { status: 'completed', conclusion,
      completedAt: Date.now(), conclusionText: `${conclusion}: ${expected.deploymentId} at ${expected.sha}`,
      output: { deploymentId: expected.deploymentId, sha: expected.sha,
        ...(report ? { assets: report.assets, manifestSha256: report.manifestSha256 } : {}) } });
    const completed = await api(`${path}/${run.id}`);
    if (completed.deploymentId !== expected.deploymentId || completed.checkId !== checkId
      || completed.status !== 'completed' || completed.conclusion !== conclusion) fail('release-artifact-result-mismatch');
  };
}

function command(file, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: 30_000, maxBuffer: 2 * maxBytes, encoding: 'buffer' }, (error, stdout) => {
      if (error) reject(new Error('release-operator-command-failed'));
      else resolve(stdout);
    });
    child.stdin.end(input);
  });
}

export function selectAttemptArtifact(run, artifacts) {
  const start = Date.parse(run.run_started_at), end = Date.parse(run.updated_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail('invalid-release-attempt');
  const matches = artifacts.filter(artifact => artifact.name.startsWith('release-ready-')
    && Date.parse(artifact.created_at) >= start && Date.parse(artifact.created_at) <= end);
  if (matches.length !== 1) fail('release-artifact-evidence-count');
  return matches[0];
}

export function validateOperatorEvidence(run, artifact, report, now = Date.now()) {
  if (run.event !== 'repository_dispatch' || run.path !== '.github/workflows/release.yml'
    || run.repository?.full_name !== repository || run.head_branch !== 'main'
    || run.conclusion !== 'success' || run.status !== 'completed') fail('untrusted-release-run');
  if (report.phase !== 'ready' || report.checks?.length !== 1
    || report.dispatch?.senderId !== 35613825 || report.dispatch?.action !== 'vercel.deployment.ready') fail('invalid-release-report');
  const checked = report.checks[0];
  const expected = validateRelease(checked);
  const age = now - Date.parse(checked.checkedAt);
  if (selectAttemptArtifact(run, [artifact]) !== artifact
    || Date.parse(checked.checkedAt) < Date.parse(run.run_started_at)
    // GitHub artifact timestamps have second precision; the smoke uses milliseconds.
    || Math.floor(Date.parse(checked.checkedAt) / 1000) > Math.floor(Date.parse(artifact.created_at) / 1000)) fail('invalid-release-attempt-evidence');
  if (!checked.ok || !checked.browser || !Number.isFinite(age) || age < 0 || age > 30 * 60_000
    || !/^[a-f0-9]{64}$/.test(checked.manifestSha256) || !Number.isInteger(checked.assets) || checked.assets < 1) fail('invalid-release-evidence');
  if (artifact.name !== `release-ready-${expected.deploymentId}` || artifact.expired
    || artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_branch !== 'main'
    || artifact.workflow_run?.head_sha !== run.head_sha) fail('release-artifact-evidence-mismatch');
  return expected;
}

async function completeAsOperator(runId) {
  if (!/^\d+$/.test(runId || '')) fail('invalid-github-run-id');
  const gh = async path => JSON.parse((await command('gh', ['api', `repos/${repository}/${path}`])).toString());
  const run = await gh(`actions/runs/${runId}`);
  const artifacts = (await gh(`actions/runs/${runId}/artifacts?per_page=100`)).artifacts;
  const artifact = selectAttemptArtifact(run, artifacts);
  if (!Number.isInteger(artifact.id)) fail('invalid-artifact-id');
  const archive = await command('gh', ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`]);
  const bytes = await command('python3', ['-c', 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); i=z.getinfo("release-ready.json"); assert i.file_size <= 1048576; sys.stdout.buffer.write(z.read(i))'], archive);
  const report = JSON.parse(bytes.toString());
  const expected = validateOperatorEvidence(run, artifact, report);
  const checkId = process.env.VERCEL_RELEASE_CHECK_ID || (await command('gh', ['variable', 'get', 'VERCEL_RELEASE_CHECK_ID', '--repo', repository])).toString().trim();
  const apiCaller = async (path, body) => {
    const args = ['api', `${path}?teamId=${teamId}`, '--scope', 'burntfrosts-projects', '--raw'];
    if (body) args.push('--method', 'PATCH', '--input', '-');
    return JSON.parse((await command('vercel', args, body ? JSON.stringify(body) : undefined)).toString());
  };
  const finish = await startArtifactCheck(expected, { checkId, apiCaller });
  await finish('succeeded', report.checks[0]);
  process.stdout.write(`${JSON.stringify({ ok: true, phase: 'operator-completion', ...expected, githubRunId: runId })}\n`);
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
  if (phase === 'complete') return completeAsOperator(args[1]);
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
    if (!/^chk_[a-zA-Z0-9-]+$/.test(process.env.VERCEL_RELEASE_CHECK_ID)) fail('missing-artifact-gate-id');
    const oidc = await getOidcToken();
    reports.push(await checkHosted(expected, { headers: { 'x-vercel-trusted-oidc-idp-token': oidc }, browserSmoke: smokeBrowser }));
    await setStatus('success');
    const report = { phase, checks: reports,
      dispatch: { senderId: event.sender.id, action: event.action },
      artifactGate: 'awaiting-operator' };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Release ${phase}\n\nDeployment: \`${expected.deploymentId}\`\n\nSHA: \`${expected.sha}\`\n\n${reports.length} hosted probes passed.${report.artifactGate === 'awaiting-operator' ? ' The deployment-specific gate is awaiting operator completion.' : ''}\n`);
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
