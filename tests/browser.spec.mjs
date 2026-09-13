import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { scenes } from '../dist/scenes.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function observe(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__graphicsEvents = [];
    window.va = (action, payload) => { if (action === 'event') window.__graphicsEvents.push(payload); };
  });
  return errors;
}
async function load(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#world')).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/);
  await expect(page.locator('#loading')).toBeHidden();
}
async function seek(page, seconds) {
  await page.locator('#progress').evaluate((element, value) => {
    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, seconds);
  await expect(page.locator('#time')).toHaveText(`00:${String(seconds).padStart(2, '0')}`);
  // Two rendered frames settle transforms after an input; no wall-clock motion is running.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function select(page, index) {
  await page.locator(`.scene-card[data-scene="${index}"]`).click();
  await expect(page.locator('#world')).toHaveAttribute('data-scene', scenes[index].id);
  await expect(page.locator('.scene-card[aria-pressed="true"]')).toHaveCount(1);
}
async function expectFailure(page, stage) {
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
  for (const selector of ['#play', '#progress', '#replay']) await expect(page.locator(selector)).toBeDisabled();
  await expect.poll(() => page.evaluate(stage => window.__graphicsEvents.filter(event => event.name === 'Scene Load Failed' && event.data.stage === stage).length, stage)).toBe(1);
}

test('ten built scenes render offline from CDNs, scrub reversibly, and keep player controls usable', async ({ page }) => {
  const errors = await observe(page);
  const failedAssets = [];
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('/immutable/')) failedAssets.push(response.url()); });
  await page.route(/https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh)\//, route => route.abort());
  await load(page);
  await expect(page.locator('#world')).toHaveAttribute('data-authored-assets', 'ready');
  await expect(page.locator('.scene-card')).toHaveCount(10);
  await expect(page.locator('#scene-count')).toHaveText('10');
  for (const [index, scene] of scenes.entries()) {
    await select(page, index);
    await seek(page, 18);
    const firstTier = await page.locator('#world').getAttribute('data-quality');
    const first = digest(await page.locator('#world').screenshot());
    await seek(page, 27);
    const later = digest(await page.locator('#world').screenshot());
    await seek(page, 18);
    const finalTier = await page.locator('#world').getAttribute('data-quality');
    expect(digest(await page.locator('#world').screenshot()), `${scene.id}: reverse scrubbing (${firstTier} → ${finalTier})`).toBe(first);
    expect(later, `${scene.id}: timeline changes pixels`).not.toBe(first);
    await expect(page.locator('#error')).toBeHidden();
  }
  const beforeOrbit = digest(await page.locator('#world').screenshot());
  await page.locator('#world').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => digest(await page.locator('#world').screenshot())).not.toBe(beforeOrbit);
  await page.locator('#reset-camera').click();
  await expect.poll(async () => digest(await page.locator('#world').screenshot())).toBe(beforeOrbit);
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
  await expect(page.locator('#player #progress')).toBeVisible();
  await expect(page.locator('#player #play')).toBeVisible();
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const index of [0, 4, 5, 6]) {
    await select(page, index);
    await seek(page, 18);
    await expect(page.locator('#world')).toHaveAttribute('data-quality', /balanced|lite/);
    expect(Number(await page.locator('#world').getAttribute('data-triangles')), `${scenes[index].id}: phone geometry budget`).toBeLessThan(150000);
  }
  await select(page, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#progress')).toHaveAccessibleName('Simulation timeline');
  await expect(page.locator('#speed')).toHaveAccessibleName(/speed.*[.\d]+/i);
  await expect(page.locator('#world')).toHaveAccessibleName(/Independence Day/i);
  const events = await page.evaluate(() => window.__graphicsEvents);
  expect(new Set(events.filter(event => event.name === 'Scene Ready').map(event => event.data.scene)).size).toBe(10);
  expect(events.some(event => event.name === 'Graphics Quality')).toBe(true);
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});

test('one optional authored asset failure retains usable procedural scenes', async ({ page }) => {
  const errors = await observe(page);
  await page.route('**/*city-kit*.glb', route => route.abort());
  await load(page);
  await expect(page.locator('#world')).toHaveAttribute('data-authored-assets', 'degraded');
  for (const index of [0, 4, 9]) { await select(page, index); await seek(page, 18); }
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#play')).toBeEnabled();
  const failures = await page.evaluate(() => window.__graphicsEvents.filter(event => event.name === 'Scene Load Failed'));
  expect(failures.some(event => event.data.stage === 'authored-assets')).toBe(true);
  expect(errors).toEqual([]);
});

test('module download failure reports a bounded startup category and disables playback', async ({ page }) => {
  await observe(page);
  await page.route('**/*simulation*.js*', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectFailure(page, 'module-load');
});

test('unavailable WebGL is reported distinctly', async ({ page }) => {
  await observe(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /webgl/i.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expectFailure(page, 'webgl-init');
});

test('a real WebGL context loss stops the player and reports once', async ({ page }) => {
  await observe(page);
  await load(page);
  await page.locator('#world').evaluate(canvas => {
    const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('QA WebGL implementation must support WEBGL_lose_context');
    extension.loseContext();
  });
  await expectFailure(page, 'context-lost');
});

for (const privacy of ['doNotTrack', 'globalPrivacyControl']) {
  test(`${privacy} suppresses bootstrap failure telemetry`, async ({ page }) => {
    await observe(page);
    await page.addInitScript(property => Object.defineProperty(navigator, property, { configurable: true, get: () => property === 'doNotTrack' ? '1' : true }), privacy);
    await page.route('**/*simulation*.js*', route => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#error')).toBeVisible();
    expect(await page.evaluate(() => window.__graphicsEvents)).toEqual([]);
  });
}
