import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual, parseArgs, promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const maximumSnapshotAge = 60 * 60 * 1000;

// Findings contain contract paths and outcomes, never provider values or errors.
export function compareContract(provider, expected, actual, prefix = '') {
  return Object.entries(expected).flatMap(([key, value]) => {
    const check = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) return compareContract(provider, value, actual?.[key], check);
    return [{ provider, check, status: isDeepStrictEqual(value, actual?.[key]) ? 'ok' : 'drift' }];
  });
}

export function validateSnapshot(snapshot, zoneId, now = Date.now()) {
  if (snapshot?.schemaVersion !== 1 || snapshot.zoneId !== zoneId) throw new Error('snapshot_identity_invalid');
  const age = now - Date.parse(snapshot.checkedAt);
  if (!Number.isFinite(age) || age < -60000 || age > maximumSnapshotAge) throw new Error('snapshot_expired_or_future');
  if (!snapshot.cloudflare || !Array.isArray(snapshot.cloudflare.requestHeaderRules)) throw new Error('snapshot_shape_invalid');
  for (const rule of snapshot.cloudflare.requestHeaderRules) {
    for (const header of Object.values(rule.headers || {})) {
      if (Object.keys(header).some(key => !['operation', 'valueConfigured'].includes(key))) throw new Error('snapshot_not_redacted');
      if ('valueConfigured' in header && typeof header.valueConfigured !== 'boolean') throw new Error('snapshot_not_redacted');
    }
  }
  return snapshot.cloudflare;
}

export function projectCloudflare(state) {
  const rules = (entries, extra = () => ({})) => entries.filter(rule => rule.enabled !== false).map(rule => ({
    id: rule.id, enabled: true, action: rule.action,
    expressionSha256: createHash('sha256').update(rule.expression).digest('hex'), ...extra(rule),
  }));
  return {
    dnsRecords: state.dnsRecords.filter(record => record.type === 'CNAME').map(({ type, name, content, proxied }) => ({ type, name, content, proxied })).sort((a, b) => a.name.localeCompare(b.name)),
    dnssecStatus: state.dnssecStatus,
    settings: state.settings,
    // Rule order is significant: a new or reordered active rule is drift.
    wafRules: rules(state.wafRules),
    cacheRules: rules(state.cacheRules, rule => ({ cache: rule.cache })),
    requestHeaderRules: rules(state.requestHeaderRules, rule => ({ headers: Object.fromEntries(Object.entries(rule.headers).map(([name, header]) => [name.toLowerCase(), {
      operation: header.operation, ...(header.operation === 'set' ? { valueConfigured: header.valueConfigured === true } : {}),
    }])) })),
  };
}

export function projectVercel(project, config, checks = []) {
  return {
    projectId: project.id, teamId: project.accountId, nodeVersion: project.nodeVersion,
    ssoDeploymentType: project.ssoProtection?.deploymentType, gitForkProtection: project.gitForkProtection,
    buildMachineType: project.resourceConfig?.buildMachineType,
    elasticConcurrencyEnabled: project.resourceConfig?.elasticConcurrencyEnabled,
    blockingChecks: checks.filter(check => check.blocks !== 'none').map(check => ({
      id: check.id, name: check.name, projectId: check.projectId, ownerId: check.ownerId,
      requires: check.requires, blocks: check.blocks, targets: check.targets?.slice().sort(), timeout: check.timeout,
      source: Object.fromEntries(['kind', 'provider', 'externalCheckName'].filter(key => Object.hasOwn(check.source || {}, key)).map(key => [key, check.source[key]])),
    })).sort((a, b) => a.name.localeCompare(b.name)),
    effectiveConfig: Object.fromEntries(['framework', 'installCommand', 'buildCommand', 'outputDirectory']
      .map(key => [key, Object.hasOwn(config, key) ? config[key] : project[key]])),
  };
}

async function cliJSON(command, args) {
  const { stdout } = await run(command, args, { cwd: root, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function readGitHub({ repository, branch }) {
  const [protection, permissions, selected] = await Promise.all([
    cliJSON('gh', ['api', `repos/${repository}/branches/${branch}/protection`]),
    cliJSON('gh', ['api', `repos/${repository}/actions/permissions`]),
    cliJSON('gh', ['api', `repos/${repository}/actions/permissions/selected-actions`]),
  ]);
  return {
    branchProtection: {
      strict: protection.required_status_checks?.strict,
      requiredChecks: protection.required_status_checks?.checks?.map(check => ({ context: check.context, appId: check.app_id })).sort((a, b) => a.context.localeCompare(b.context)),
      enforceAdmins: protection.enforce_admins?.enabled,
      allowForcePushes: protection.allow_force_pushes?.enabled, allowDeletions: protection.allow_deletions?.enabled,
    },
    actions: {
      enabled: permissions.enabled, allowedActions: permissions.allowed_actions,
      shaPinningRequired: permissions.sha_pinning_required,
      githubOwnedAllowed: selected.github_owned_allowed, verifiedAllowed: selected.verified_allowed,
      patternsAllowed: selected.patterns_allowed?.slice().sort(),
    },
  };
}

async function readVercel({ projectId, teamId }) {
  const [project, result] = await Promise.all([
    cliJSON('vercel', ['api', `/v9/projects/${projectId}?teamId=${teamId}`, '--method', 'GET']),
    cliJSON('vercel', ['api', `/v2/projects/${projectId}/checks?teamId=${teamId}`, '--method', 'GET']),
  ]);
  return { project, checks: result.checks };
}

async function readCloudflare(zoneId, token) {
  async function get(suffix) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}${suffix}`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('cloudflare_read_failed');
    const body = await response.json();
    if (!body.success || body.result_info?.total_pages > 1) throw new Error('cloudflare_read_incomplete');
    return body.result;
  }
  const [zone, dns, dnssec, settings, waf, cache, transform] = await Promise.all([
    get(''), get('/dns_records?type=CNAME&per_page=100'), get('/dnssec'), get('/settings'),
    get('/rulesets/phases/http_request_firewall_custom/entrypoint'),
    get('/rulesets/phases/http_request_cache_settings/entrypoint'),
    get('/rulesets/phases/http_request_late_transform/entrypoint'),
  ]);
  if (zone.id !== zoneId) throw new Error('cloudflare_zone_mismatch');
  const value = Object.fromEntries(settings.map(setting => [setting.id, setting.value]));
  const hsts = value.security_header?.strict_transport_security || {};
  const basic = rule => ({ id: rule.id, enabled: rule.enabled !== false, action: rule.action, expression: rule.expression });
  return {
    dnsRecords: dns, dnssecStatus: dnssec.status,
    settings: { ssl: value.ssl, minTlsVersion: value.min_tls_version, alwaysUseHttps: value.always_use_https,
      hsts: { enabled: hsts.enabled, maxAge: hsts.max_age, includeSubdomains: hsts.include_subdomains, preload: hsts.preload } },
    wafRules: waf.rules.map(basic),
    cacheRules: cache.rules.map(rule => ({ ...basic(rule), cache: rule.action_parameters?.cache })),
    requestHeaderRules: transform.rules.map(rule => ({ ...basic(rule), headers: Object.fromEntries(Object.entries(rule.action_parameters?.headers || {}).map(([name, header]) => [name.toLowerCase(), {
      operation: header.operation, ...(header.operation === 'set' ? { valueConfigured: typeof header.value === 'string' && header.value.length > 0 } : {}),
    }])) })),
  };
}

export async function checkInfrastructure({ inventory, config, snapshot, token, now = Date.now(), readers = {} }) {
  const checks = [], sources = {};
  async function check(provider, load, project = value => value) {
    try { checks.push(...compareContract(provider, inventory[provider], project(await load()))); }
    catch { checks.push({ provider, check: 'read', status: 'unavailable' }); }
  }
  await Promise.all([
    check('github', () => (readers.github || readGitHub)(inventory.identities)),
    check('vercel', async () => {
      const { project, checks } = await (readers.vercel || readVercel)(inventory.identities);
      return projectVercel(project, config, checks);
    }),
    check('cloudflare', async () => {
      if (snapshot) {
        const value = validateSnapshot(snapshot, inventory.identities.zoneId, now);
        sources.cloudflare = { mode: 'snapshot', checkedAt: snapshot.checkedAt, continuousMonitoring: false };
        return value;
      }
      if (!token) throw new Error('cloudflare_credentials_unavailable');
      sources.cloudflare = { mode: 'api', checkedAt: new Date(now).toISOString(), continuousMonitoring: false };
      return (readers.cloudflare || readCloudflare)(inventory.identities.zoneId, token);
    }, projectCloudflare),
  ]);
  checks.sort((a, b) => `${a.provider}.${a.check}`.localeCompare(`${b.provider}.${b.check}`));
  const status = checks.some(check => check.status === 'drift') ? 'drift' : checks.some(check => check.status === 'unavailable') ? 'unavailable' : 'ok';
  // Configuration checks cannot prove that a release workflow actually ran.
  return { schemaVersion: 1, checkedAt: new Date(now).toISOString(), scope: 'provider-configuration', status, releaseActivation: 'unverified', sources, checks };
}

async function main() {
  try {
    const { values } = parseArgs({ options: { 'cloudflare-snapshot': { type: 'string' } }, strict: true });
    const [inventory, config, snapshot] = await Promise.all([
      readFile(new URL('../docs/infrastructure-state.json', import.meta.url), 'utf8').then(JSON.parse),
      readFile(new URL('../vercel.json', import.meta.url), 'utf8').then(JSON.parse),
      values['cloudflare-snapshot'] ? readFile(values['cloudflare-snapshot'], 'utf8').then(JSON.parse) : undefined,
    ]);
    const result = await checkInfrastructure({ inventory, config, snapshot, token: process.env.CLOUDFLARE_API_TOKEN });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'drift' ? 1 : result.status === 'unavailable' ? 2 : 0;
  } catch {
    console.log(JSON.stringify({ schemaVersion: 1, status: 'unavailable', error: 'Configuration, arguments, or snapshot could not be read.' }));
    process.exitCode = 2;
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
