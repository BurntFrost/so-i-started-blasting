import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkInfrastructure, compareContract, projectCloudflare, projectVercel, validateSnapshot } from '../tools/check-infrastructure.mjs';

const inventory = JSON.parse(await readFile(new URL('../docs/infrastructure-state.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-09-13T15:00:00Z');
const state = {
  dnsRecords: [{ type: 'CNAME', name: 'example.com', content: 'origin.example', proxied: true }],
  dnssecStatus: 'active', settings: { ssl: 'strict' },
  wafRules: [
    { id: 'us', enabled: true, action: 'block', expression: 'ip.src.country ne "US"' },
    { id: 'crawler', enabled: true, action: 'block', expression: 'http.user_agent contains "ExampleBot"' },
  ],
  cacheRules: [{ id: 'cache', enabled: true, action: 'set_cache_settings', expression: 'true', cache: false }],
  requestHeaderRules: [{ id: 'origin', enabled: true, action: 'rewrite', expression: 'ssl and http.host eq "example.com"', headers: {
    'x-vercel-protection-bypass': { operation: 'set', valueConfigured: true }, 'x-vercel-set-bypass-cookie': { operation: 'remove' },
  } }],
};
const snapshot = () => ({ schemaVersion: 1, zoneId: inventory.identities.zoneId, checkedAt: new Date(now - 1000).toISOString(), cloudflare: structuredClone(state) });

test('Cloudflare snapshots are bound to the intended zone and one-hour freshness', () => {
  assert.deepEqual(validateSnapshot(snapshot(), inventory.identities.zoneId, now), state);
  assert.throws(() => validateSnapshot({ ...snapshot(), zoneId: 'wrong' }, inventory.identities.zoneId, now), /identity/);
  for (const checkedAt of [new Date(now - 3600001).toISOString(), new Date(now + 60001).toISOString(), 'invalid']) {
    assert.throws(() => validateSnapshot({ ...snapshot(), checkedAt }, inventory.identities.zoneId, now), /expired_or_future/);
  }
});

test('secret-bearing snapshot headers are rejected before projection', () => {
  const value = snapshot();
  value.cloudflare.requestHeaderRules[0].headers['x-vercel-protection-bypass'].value = 'never-print-this-secret';
  assert.throws(() => validateSnapshot(value, inventory.identities.zoneId, now), /not_redacted/);
});

test('audience expressions, rule ordering, cache, and proxy changes are drift', () => {
  const expected = projectCloudflare(state);
  assert.ok(compareContract('cloudflare', expected, projectCloudflare(state)).every(check => check.status === 'ok'));
  for (const change of [
    value => { value.wafRules[0].expression = 'false'; },
    value => { value.wafRules.unshift({ id: 'skip', enabled: true, action: 'skip', expression: 'true' }); },
    value => { value.wafRules.reverse(); },
    value => { value.cacheRules[0].cache = true; },
    value => { value.dnsRecords[0].proxied = false; },
    value => { value.requestHeaderRules[0].headers['x-vercel-protection-bypass'].valueConfigured = false; },
  ]) {
    const value = structuredClone(state); change(value);
    assert.ok(compareContract('cloudflare', expected, projectCloudflare(value)).some(check => check.status === 'drift'));
  }
});

test('effective Vercel config uses explicit repository values including null', () => {
  const config = { framework: null, installCommand: 'npm ci', buildCommand: 'npm run build', outputDirectory: 'build' };
  const actual = projectVercel({ framework: 'nextjs', buildCommand: 'wrong', resourceConfig: {} }, config);
  assert.deepEqual(actual.effectiveConfig, config);
  assert.equal(projectVercel({ framework: 'nextjs' }, {}).effectiveConfig.framework, 'nextjs');
});

test('a removed or nonblocking artifact gate cannot match the desired configuration', () => {
  const checks = structuredClone(inventory.vercel.blockingChecks);
  const expected = projectVercel({}, {}, checks);
  checks.find(check => check.name === 'release-artifact').blocks = 'none';
  assert.ok(compareContract('vercel', expected, projectVercel({}, {}, checks))
    .some(check => check.check === 'blockingChecks' && check.status === 'drift'));
});

test('provider errors and mismatched values never leak into redacted findings', async () => {
  const result = await checkInfrastructure({ inventory, config: {}, snapshot: snapshot(), now,
    readers: { github: async () => { throw new Error('token=never-print-this-secret'); }, vercel: async () => ({ project: { id: 'never-print-this-secret' }, checks: [] }) },
  });
  assert.equal(JSON.stringify(result).includes('never-print-this-secret'), false);
  assert.ok(result.checks.some(check => check.provider === 'github' && check.status === 'unavailable'));
  assert.ok(result.checks.some(check => check.provider === 'vercel' && check.check === 'projectId' && check.status === 'drift'));
});

test('passing provider contracts do not falsely certify the release gate or continuous snapshot monitoring', async () => {
  const local = { ...inventory, cloudflare: projectCloudflare(state) };
  const project = { id: local.identities.projectId, accountId: local.identities.teamId, nodeVersion: '24.x',
    ssoProtection: { deploymentType: 'all' }, gitForkProtection: true,
    resourceConfig: { buildMachineType: 'basic', elasticConcurrencyEnabled: false } };
  const result = await checkInfrastructure({ inventory: local, config: local.vercel.effectiveConfig, snapshot: snapshot(), now,
    readers: { github: async () => local.github, vercel: async () => ({ project, checks: local.vercel.blockingChecks }) },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.scope, 'provider-configuration');
  assert.ok(result.checks.every(check => check.status === 'ok'));
  assert.equal(result.sources.cloudflare.continuousMonitoring, false);
  assert.equal(result.releaseActivation, 'unverified');
});

test('expired snapshots fail closed even when the provider contract would match', async () => {
  const result = await checkInfrastructure({ inventory, config: {}, snapshot: { ...snapshot(), checkedAt: '2020-01-01T00:00:00Z' }, now,
    readers: { github: async () => inventory.github, vercel: async () => ({}) },
  });
  assert.ok(result.checks.some(check => check.provider === 'cloudflare' && check.status === 'unavailable'));
  assert.equal(result.sources.cloudflare, undefined);
});
