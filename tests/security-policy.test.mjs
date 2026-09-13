import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = config.headers.find(rule => rule.source === '/(.*)').headers;
const directives = name => new Map(headers.find(header => header.key === name).value
  .split(';').map(value => value.trim().split(/\s+/)).map(([key, ...values]) => [key, values]));

test('enforced CSP protects resource and navigation boundaries without disabling edge challenges', () => {
  const policy = directives('Content-Security-Policy');
  for (const directive of ['object-src', 'form-action', 'frame-ancestors']) assert.deepEqual(policy.get(directive), ["'none'"]);
  for (const directive of ['base-uri', 'media-src']) assert.deepEqual(policy.get(directive), ["'self'"]);
  assert.ok(policy.get('connect-src').includes("'self'"), 'audio fetch and Vercel collectors use same-origin delivery');
  assert.ok(policy.get('frame-src').includes("'self'"), 'the edge detection bootstrap creates a same-origin frame');
  assert.ok(policy.get('frame-src').includes('https://challenges.cloudflare.com'));
  // Dynamic edge scripts need a nonce at injection time. Do not silently enforce
  // a fallback default-src that blocks them, or claim script protection here.
  for (const directive of ['default-src', 'script-src', 'script-src-elem']) assert.equal(policy.has(directive), false);
});

test('strict script policy stays diagnostic without allowing inline scripts or broad eval', () => {
  const policy = directives('Content-Security-Policy-Report-Only');
  assert.deepEqual(policy.get('default-src'), ["'self'"]);
  assert.deepEqual(policy.get('script-src-attr'), ["'none'"]);
  assert.ok(policy.get('script-src').includes("'wasm-unsafe-eval'"));
  assert.equal(policy.get('script-src').includes("'unsafe-inline'"), false);
  assert.equal(policy.get('script-src').includes("'unsafe-eval'"), false);
  assert.equal(policy.get('script-src').some(value => value.startsWith("'nonce-")), false, 'never install a static nonce');
});
