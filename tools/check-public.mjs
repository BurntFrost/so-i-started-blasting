import { pathToFileURL } from 'node:url';

const hosts = ['soistartedblasting.com', 'www.soistartedblasting.com'];
const origin = 'so-i-started-blasting.vercel.app';

export async function checkPublic({ fetchImpl = fetch } = {}) {
  const results = [];
  async function check(name, url, validate) {
    try {
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (!await validate(response)) throw new Error('unexpected-response');
      results.push({ name, ok: true });
    } catch {
      results.push({ name, ok: false, error: 'request-or-contract-failed' });
    }
  }
  for (const host of hosts) {
    await check(`${host}:page`, `https://${host}/`, async response => {
      if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return false;
      if (response.headers.get('x-frame-options') !== 'DENY' || response.headers.get('x-content-type-options') !== 'nosniff') return false;
      if (!response.headers.get('content-security-policy') || !response.headers.get('cache-control')?.includes('must-revalidate')) return false;
      return (await response.text()).includes('id="world"');
    });
  }
  await check('hashed-asset', `https://${hosts[0]}/asset-manifest.json`, async response => {
    if (response.status !== 200) return false;
    const manifest = await response.json();
    const asset = manifest['/boot.js'];
    if (typeof asset !== 'string' || !/^\/immutable\/[a-zA-Z0-9/_-]+\.[a-f0-9]{16}\.js$/.test(asset)) return false;
    const file = await fetchImpl(`https://${hosts[0]}${asset}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const cache = file.headers.get('cache-control') || '';
    const valid = file.status === 200 && /(?:java|ecma)script/.test(file.headers.get('content-type') || '') && cache.includes('max-age=31536000') && cache.includes('immutable');
    await file.body?.cancel();
    return valid;
  });
  for (const provider of ['insights', 'speed-insights']) {
    await check(`${provider}:script`, `https://${hosts[0]}/_vercel/${provider}/script.js`, async response => {
      const valid = response.status === 200 && /(?:java|ecma)script/.test(response.headers.get('content-type') || '');
      await response.body?.cancel();
      return valid;
    });
  }
  await check('origin-protection', `https://${origin}/`, async response => {
    if (![302, 303, 307, 308].includes(response.status)) return false;
    const location = new URL(response.headers.get('location') || '', `https://${origin}`);
    await response.body?.cancel();
    return location.protocol === 'https:' && location.hostname === 'vercel.com' && location.pathname.startsWith('/sso-api');
  });
  await check('reserved-query-block', `https://${hosts[0]}/?_vercel_share=health-check-invalid`, async response => {
    await response.body?.cancel();
    return response.status === 403;
  });
  return { ok: results.every(result => result.ok), checkedAt: new Date().toISOString(), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await checkPublic();
  console.log(JSON.stringify(report));
  process.exitCode = report.ok ? 0 : 1;
}
