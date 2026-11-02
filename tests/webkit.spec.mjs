import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { seekTimeline, settleFrames, MOTION_STATUS, waitForSceneMotion } from '../tools/capture-media.mjs';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers
  .filter(header => header.key.startsWith('Content-Security-Policy')).map(header => [header.key.toLowerCase(), header.value]));

async function observe(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}
async function ready(page) {
  await expect(page.locator('#world')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('#world')).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#error')).toBeHidden();
}

test('WebKit loads the authored wave and restores exact reverse pixels within the phone budget', async ({ page }) => {
  const errors = await observe(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ready(page);
  const canvas = page.locator('#world');
  await expect(canvas).toHaveAttribute('data-authored-assets', 'ready');
  await expect(canvas).toHaveAttribute('data-particle-atlas', /ready|fallback/);
  await expect(canvas).toHaveAttribute('data-weather-texture', /ready|fallback/);
  await page.locator('[data-scene-id="deep-impact"]').click();
  await expect(canvas).toHaveAttribute('data-impact-wave', 'ready');
  await expect(canvas).toHaveAttribute('data-impact-mist', 'ready');
  const shot = async time => {
    await seekTimeline(page, time); await settleFrames(page);
    const bytes = await canvas.screenshot({ style: 'body * { visibility:hidden!important } #world { visibility:visible!important }' });
    return createHash('sha256').update(bytes).digest('hex');
  };
  const before = await shot(18), later = await shot(25);
  expect(await shot(18)).toBe(before);
  expect(later).not.toBe(before);
  expect(Number(await canvas.getAttribute('data-triangles'))).toBeLessThan(150000);
  expect(errors).toEqual([]);
});

test('WebKit initializes and obeys audio consent, pause/resume, and scene changes', async ({ page }) => {
  const errors = await observe(page), requests = [];
  page.on('request', request => { if (/\.mp3(?:\?|$)/.test(request.url())) requests.push(request.url()); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ready(page);
  const player = page.locator('#player');
  await expect(player).toHaveAttribute('data-audio-state', 'off');
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Enable sound', exact: true }).tap();
  await expect(player).toHaveAttribute('data-audio-state', 'paused');
  expect(requests.length).toBeGreaterThan(0);
  await page.locator('#play').click();
  await expect(player).toHaveAttribute('data-audio-state', 'playing');
  await expect(player).toHaveAttribute('data-audio-sources', /^[1-9]\d*$/);
  // Span a UI refresh: WebKit drops the click if its pressed text node is replaced.
  await page.locator('#play').click({ delay: 300 });
  await expect(player).toHaveAttribute('data-audio-state', 'paused');
  await expect(player).toHaveAttribute('data-audio-sources', '0');
  await page.locator('#play').click();
  await expect(player).toHaveAttribute('data-audio-state', 'playing');
  await page.locator('[data-scene-id="interstellar"]').click();
  await expect(player).toHaveAttribute('data-audio-state', 'paused');
  await expect(player).toHaveAttribute('data-audio-scene', 'interstellar');
  await expect(player).toHaveAttribute('data-audio-sources', '0');
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('WebKit restores a usable player after real history navigation', async ({ page }) => {
  const errors = await observe(page);
  await page.addInitScript(() => {
    window.__pageRestored = false;
    addEventListener('pageshow', event => { window.__pageRestored = event.persisted; });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'paused');
  await page.locator('#play').click();
  await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'playing');
  await page.goto('about:blank');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await ready(page);
  const persisted = await page.evaluate(() => window.__pageRestored);
  test.info().annotations.push({ type: 'history-restoration', description: persisted ? 'BFCache document restored' : 'Browser reloaded the history entry' });
  if (persisted) {
    await expect(page.locator('#player')).toHaveAttribute('data-audio-state', /playing|blocked/);
    if (await page.locator('#player').getAttribute('data-audio-state') === 'blocked') await page.locator('#sound-toggle').click();
  } else {
    await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'off');
    await page.locator('#sound-toggle').click();
    await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'paused');
    await page.locator('#play').click();
  }
  await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'playing');
  await page.locator('#play').click();
  await expect(page.locator('#player')).toHaveAttribute('data-audio-sources', '0');
  expect(errors).toEqual([]);
});

test('compatible enforced CSP runs the player and retains strict script diagnostics', async ({ page }) => {
  const errors = await observe(page);
  await page.addInitScript(() => {
    window.__policyViolations = [];
    addEventListener('securitypolicyviolation', event => {
      window.__policyViolations.push({ directive: event.effectiveDirective, disposition: event.disposition });
    });
  });
  await page.route('**/', async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace('</body>', '<script>window.__edgeInlineRan=true</script></body>');
    await route.fulfill({ response, headers: { ...response.headers(), ...csp }, body });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ready(page);
  expect(await page.evaluate(() => window.__edgeInlineRan)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__policyViolations.some(event => event.disposition === 'report' && event.directive === 'script-src-elem'))).toBe(true);
  expect(await page.evaluate(() => window.__policyViolations.filter(event => event.disposition === 'enforce'))).toEqual([]);
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'paused');
  await page.evaluate(async () => {
    try { await fetch('https://outside.invalid/csp-check'); } catch { /* Expected CSP denial. */ }
  });
  await expect.poll(() => page.evaluate(() => window.__policyViolations.some(event => event.disposition === 'enforce' && event.directive === 'connect-src'))).toBe(true);
  expect(errors).toEqual([]);
});

for (const [id, second, later] of [['2012', 18, 27], ['twister', 18, 25], ['knowing', 12, 24], ['interstellar', 17, 27]]) {
  test(`WebKit authored motion ${id} loads, reverses and orbits within the phone budget`, async ({ page }) => {
    const errors = await observe(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const canvas = page.locator('#world');
    await expect(canvas).toHaveAttribute('data-authored-assets', 'ready');
    await expect(canvas).toHaveAttribute('data-particle-atlas', /ready|fallback/);
    await expect(canvas).toHaveAttribute('data-weather-texture', /ready|fallback/);
    await page.locator(`[data-scene-id="${id}"]`).click();
    await waitForSceneMotion(page, id);
    const attribute = `data-${MOTION_STATUS[id].replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    await expect(canvas).toHaveAttribute(attribute, 'ready');
    if (id === 'twister') await expect(canvas).toHaveAttribute('data-twister-bake', /ready|fallback/);
    if (id === 'knowing' || id === 'interstellar') await expect(canvas).toHaveAttribute('data-nebula-texture', /ready|fallback/);
    const shot = async time => {
      await seekTimeline(page, time); await settleFrames(page);
      return createHash('sha256').update(await canvas.screenshot({ style: 'body * { visibility:hidden!important } #world { visibility:visible!important }' })).digest('hex');
    };
    const before = await shot(second), after = await shot(later);
    expect(await shot(second), `${id}: authored reverse pixels`).toBe(before);
    expect(after, `${id}: timeline changes pixels`).not.toBe(before);
    await canvas.focus(); await page.keyboard.press('ArrowRight'); await canvas.blur();
    expect(await shot(second), `${id}: paused orbit changes the view`).not.toBe(before);
    await expect(page.locator('#time')).toHaveText(`00:${second}`);
    await page.locator('#reset-camera').click(); await settleFrames(page);
    expect(Number(await canvas.getAttribute('data-triangles')), `${id}: phone geometry`).toBeLessThan(150000);
    await expect(page.locator('#play')).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
