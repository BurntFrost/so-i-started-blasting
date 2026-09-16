import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { scenes } from '../dist/scenes.js';
import { QUALITY, seekTimeline, settleFrames } from '../tools/capture-media.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function changedPixels(page, before, after) {
  return page.evaluate(async images => {
    const pixels = await Promise.all(images.map(async data => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const result = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      return result;
    }));
    if (pixels[0].length !== pixels[1].length) return Infinity;
    let changed = 0;
    for (let i = 0; i < pixels[0].length; i += 4) {
      if (pixels[0].subarray(i, i + 4).some((value, channel) => value !== pixels[1][i + channel])) changed++;
    }
    return changed;
  }, [before.toString('base64'), after.toString('base64')]);
}
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
  await seekTimeline(page, seconds);
  await expect(page.locator('#time')).toHaveText(`00:${String(Math.floor(seconds)).padStart(2, '0')}`);
  await settleFrames(page);
}
async function select(page, index) {
  await page.locator(`.scene-card[data-scene="${index}"]`).click();
  await expect(page.locator('#world')).toHaveAttribute('data-scene', scenes[index].id);
  if (index === 4) await expect(page.locator('#world')).toHaveAttribute('data-explosion-bake', /ready|fallback/);
  // The A.T. field mask arrives asynchronously; screenshots must not straddle its arrival.
  if (scenes[index].id === 'evangelion') await expect(page.locator('#world')).toHaveAttribute('data-at-field-texture', /ready|fallback/);
  await expect(page.locator('.scene-card[aria-pressed="true"]')).toHaveCount(1);
}
async function expectFailure(page, stage) {
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
  for (const selector of ['#play', '#progress', '#replay']) await expect(page.locator(selector)).toBeDisabled();
  await expect.poll(() => page.evaluate(stage => window.__graphicsEvents.filter(event => event.name === 'Scene Load Failed' && event.data.stage === stage).length, stage)).toBe(1);
}

test('every built scene renders offline from CDNs, scrubs reversibly, and keeps player controls usable', async ({ page }) => {
  const errors = await observe(page);
  const failedAssets = [];
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('/immutable/')) failedAssets.push(response.url()); });
  await page.route(/https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh)\//, route => route.abort());
  await load(page);
  await expect(page.locator('#world')).toHaveAttribute('data-authored-assets', 'ready');
  await expect(page.locator('#world')).toHaveAttribute('data-quality', 'balanced');
  await expect(page.locator('.scene-card')).toHaveCount(scenes.length);
  await expect(page.locator('#scene-count')).toHaveText(String(scenes.length));
  for (const [index, scene] of scenes.entries()) {
    await select(page, index);
    await seek(page, 18);
    await expect(page.locator('#world')).toHaveAttribute('data-cinematic-look', 'graded');
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
  const beforeOrbit = await page.locator('#world').screenshot();
  await page.locator('#world').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#world').blur();
  await expect.poll(async () => changedPixels(page, beforeOrbit, await page.locator('#world').screenshot())).toBeGreaterThan(100);
  await page.locator('#reset-camera').click();
  // Reconstructing the camera can move a handful of raster edge pixels through floating-point rounding.
  await expect.poll(async () => changedPixels(page, beforeOrbit, await page.locator('#world').screenshot())).toBeLessThanOrEqual(4);
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
  await expect(page.locator('#player #progress')).toBeVisible();
  await expect(page.locator('#player #play')).toBeVisible();
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  // City scenes (including the superstorm's drifts and icicles, and the Third Impact's giant) and the three landscape scenes carry the most geometry; the space scenes confirm the budget everywhere.
  for (const index of [0, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14]) {
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
  expect(new Set(events.filter(event => event.name === 'Scene Ready').map(event => event.data.scene)).size).toBe(scenes.length);
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});

test.describe('desktop HIGH rendering', () => {
  test.use({ hasTouch: false });
  test('detailed city, shadow and finishing paths render reversibly and adapt to phone size', async ({ page }) => {
    const errors = await observe(page);
    await load(page);
    const canvas = page.locator('#world');
    await expect(canvas).toHaveAttribute('data-authored-assets', 'ready');
    await expect(canvas).toHaveAttribute('data-quality', 'high');
    await expect(canvas).toHaveAttribute('data-antialias', 'fxaa');
    await seek(page, 18);
    const first = digest(await canvas.screenshot());
    expect(Number(await canvas.getAttribute('data-triangles'))).toBeGreaterThan(150000);
    await seek(page, 27);
    expect(digest(await canvas.screenshot())).not.toBe(first);
    await seek(page, 18);
    expect(digest(await canvas.screenshot())).toBe(first);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(canvas).toHaveAttribute('data-quality', /balanced|lite/);
    await expect.poll(async () => Number(await canvas.getAttribute('data-triangles'))).toBeLessThan(150000);
    const events = await page.evaluate(() => window.__graphicsEvents);
    expect(events.some(event => event.name === 'Graphics Quality')).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('local soundtrack obeys consent, playback, scrubbing, volume and scene changes', async ({ page }) => {
  const errors = await observe(page), audioRequests = [];
  page.on('request', request => { if (/\.mp3(?:\?|$)/.test(request.url())) audioRequests.push(request.url()); });
  await load(page);
  const player = page.locator('#player');
  await expect(player).toHaveAttribute('data-audio-state', 'off');
  expect(audioRequests).toEqual([]);
  await page.locator('#sound-toggle').click();
  await expect(player).toHaveAttribute('data-audio-state', 'paused');
  await expect(player).toHaveAttribute('data-audio-sources', '0');
  expect(audioRequests.length).toBeGreaterThan(0);
  expect(audioRequests.every(url => /\/immutable\/assets\/audio\/.+\.[a-f0-9]{16}\.mp3$/.test(url))).toBe(true);
  // Cross the cue on the next frame; one simulated second can take much longer on software WebGL.
  await seek(page, 12.99);
  await page.locator('#play').click();
  await expect(player).toHaveAttribute('data-audio-state', 'playing');
  await expect.poll(async () => Number(await player.getAttribute('data-audio-cues'))).toBeGreaterThan(0);
  await page.locator('#play').click();
  await expect(player).toHaveAttribute('data-audio-sources', '0');
  await seek(page, 20);
  await expect(player).toHaveAttribute('data-audio-cues', '0');
  await page.locator('#speed').click();
  await expect(player).toHaveAttribute('data-audio-rate', '0.5');
  await page.locator('#play').click();
  await expect(player).toHaveAttribute('data-audio-sources', '1');
  await page.locator('#sound-volume').fill('0');
  await expect(player).toHaveAttribute('data-audio-state', 'muted');
  await expect(player).toHaveAttribute('data-audio-sources', '0');
  await page.locator('#sound-volume').fill('55');
  await expect(player).toHaveAttribute('data-audio-sources', '1');
  await select(page, 1);
  await expect(player).toHaveAttribute('data-audio-state', 'paused');
  await expect(player).toHaveAttribute('data-audio-sources', '0');
  await expect(player).toHaveAttribute('data-audio-scene', 'deep-impact');
  await page.locator('#sound-toggle').click();
  await expect(player).toHaveAttribute('data-audio-state', 'off');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#sound-toggle')).toBeVisible();
  await expect(page.locator('#sound-volume')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('missing audio and atmosphere textures retain working graphics and controls', async ({ page }) => {
  const errors = await observe(page);
  await page.route('**/*.mp3', route => route.abort());
  await page.route('**/*storm-noise*.webp', route => route.abort());
  await page.route('**/*nebula*.webp', route => route.abort());
  await load(page);
  await expect(page.locator('#world')).toHaveAttribute('data-weather-texture', 'fallback');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#player')).toHaveAttribute('data-audio-state', 'unavailable');
  await select(page, 9);
  await seek(page, 18);
  await expect(page.locator('#world')).toHaveAttribute('data-nebula-texture', 'fallback');
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#world')).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/);
  expect(errors).toEqual([]);
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

test('a real WebGL context loss stops playback but keeps fullscreen exit usable', async ({ page }) => {
  await observe(page);
  await load(page);
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
  await page.locator('#world').evaluate(canvas => {
    const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('QA WebGL implementation must support WEBGL_lose_context');
    extension.loseContext();
  });
  await expectFailure(page, 'context-lost');
  await expect(page.locator('#fullscreen')).toBeEnabled();
  await expect(page.locator('#fullscreen')).toHaveAccessibleName(/exit fullscreen/i);
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('#error')).toBeVisible();
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

test.describe('desktop ULTRA rendering', () => {
  test.use(QUALITY.ultra);
  test('dense desktop displays render native pixels with the 4K assets and stay reversible', async ({ page }) => {
    const errors = await observe(page);
    const assets = [];
    page.on('request', request => { if (/dusk-2k|nebula-4k|explosion-puff-4k|at-field-4k/.test(request.url())) assets.push(request.url().replace(/.*\//, '').replace(/\.[a-f0-9]{16}\./, '.')); });
    await load(page);
    const canvas = page.locator('#world');
    await expect(canvas).toHaveAttribute('data-quality-ceiling', 'ultra');
    await expect(canvas).toHaveAttribute('data-quality', 'ultra');
    await expect(canvas).toHaveAttribute('data-pixel-ratio', '2');
    await expect(canvas).toHaveAttribute('data-antialias', 'fxaa');
    await expect(canvas).toHaveAttribute('data-authored-assets', 'ready');
    await seek(page, 18);
    expect(Number(await canvas.getAttribute('data-triangles')), 'ULTRA keeps the detailed HIGH city').toBeGreaterThan(150000);
    expect(await canvas.evaluate(element => element.width === Math.floor(element.clientWidth * 2) && element.height === Math.floor(element.clientHeight * 2))).toBe(true);
    await select(page, 4);
    await expect(canvas).toHaveAttribute('data-explosion-atlas', '4096');
    await seek(page, 18);
    const first = digest(await canvas.screenshot());
    await seek(page, 27);
    expect(digest(await canvas.screenshot())).not.toBe(first);
    await seek(page, 18);
    expect(digest(await canvas.screenshot())).toBe(first);
    await select(page, 9);
    await expect(canvas).toHaveAttribute('data-nebula-texture', 'ready');
    await expect(canvas).toHaveAttribute('data-nebula-resolution', '4096');
    await select(page, 14);
    await expect(canvas).toHaveAttribute('data-at-field-texture', 'ready');
    await expect(canvas).toHaveAttribute('data-at-field-resolution', '4096');
    expect([...new Set(assets)].sort()).toEqual(['at-field-4k.webp', 'dusk-2k.hdr', 'explosion-puff-4k.webp', 'nebula-4k.webp']);
    // The asset ceiling is fixed at startup; shrinking only lowers the runtime tier, and the retained
    // ULTRA tessellation must still fit the phone geometry budget.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(canvas).toHaveAttribute('data-quality', /balanced|lite/);
    await expect(canvas).toHaveAttribute('data-quality-ceiling', 'ultra');
    for (const index of [0, 4, 7, 14]) {
      await select(page, index);
      await seek(page, 18);
      expect(Number(await canvas.getAttribute('data-triangles')), `${scenes[index].id}: phone budget with ULTRA tessellation`).toBeLessThan(150000);
    }
    // Growing again keeps the startup ceiling; promotion back up waits for measured FPS headroom during playback.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(canvas).toHaveAttribute('data-quality-ceiling', 'ultra');
    await expect(canvas).toHaveAttribute('data-quality', /balanced|high|ultra/);
    expect(errors).toEqual([]);
  });
});
