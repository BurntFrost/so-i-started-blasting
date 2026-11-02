import { test, expect } from '@playwright/test';
import { scenes } from '../dist/scenes.js';
import { seekTimeline, settleFrames, waitForSceneMotion } from '../tools/capture-media.mjs';

// Required checks exercise the player at phone resolution. Exhaustive reverse
// pixel comparisons and HIGH/ULTRA rendering remain in the manual graphics suite.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function load(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|WebGPU|shader/i.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/immutable/')) errors.push(`Asset ${response.status()}: ${response.url()}`);
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#world')).toHaveAttribute('data-authored-assets', 'ready');
  await expect(page.locator('#loading')).toBeHidden();
  return errors;
}

async function settled(page) {
  await expect.poll(() => page.locator('#world').evaluate(canvas => Object.values(canvas.dataset).includes('loading'))).toBe(false);
  await settleFrames(page);
}

test('every scene opens and draws within the phone budget', { tag: '@essential' }, async ({ page }) => {
  const errors = await load(page), canvas = page.locator('#world');
  await expect(page.locator('.scene-card')).toHaveCount(scenes.length);
  await expect(page.locator('#scene-count')).toHaveText(String(scenes.length));
  for (const scene of scenes) {
    await page.locator(`[data-scene-id="${scene.id}"]`).click();
    await waitForSceneMotion(page, scene.id);
    await seekTimeline(page, 18); await settled(page);
    await expect(canvas).toHaveAttribute('data-scene', scene.id);
    await expect(canvas).toHaveAttribute('data-render-state', 'ready');
    await expect(canvas).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/);
    await expect(canvas).toHaveAttribute('data-triangles', /^[1-9]\d*$/);
    await expect(canvas).toHaveAttribute('data-quality', /balanced|lite/);
    await expect(canvas).toBeVisible();
    expect(Number(await canvas.getAttribute('data-triangles')), `${scene.id}: phone geometry`).toBeLessThan(150000);
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#play')).toBeEnabled();
    await expect(page.locator('#time')).toHaveText('00:18');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('paused orbit, scrubbing and playback controls remain usable', { tag: '@essential' }, async ({ page }) => {
  const errors = await load(page), canvas = page.locator('#world');
  await seekTimeline(page, 18); await settled(page);
  await expect(canvas).toHaveAccessibleName(/Independence Day/i);
  await expect(page.locator('#progress')).toHaveAccessibleName('Simulation timeline');
  // One representative visual-change check protects orbit. Re-render this same
  // paused time twice so Linux WebKit's snapshot buffer has the current pose.
  const style = await page.addStyleTag({ content: 'body * { visibility:hidden!important } #world { visibility:visible!important }' });
  try {
    const capture = async () => {
      for (let frame = 0; frame < 2; frame++) { await seekTimeline(page, 18); await settleFrames(page); }
      return canvas.screenshot();
    };
    const before = await capture();
    await canvas.focus(); await page.keyboard.press('ArrowRight'); await canvas.blur();
    expect((await capture()).equals(before), 'paused orbit changes the rendered view').toBe(false);
  } finally { await style.evaluate(element => element.remove()); }
  await expect(page.locator('#time')).toHaveText('00:18');
  await page.locator('#reset-camera').tap(); await settled(page);
  await seekTimeline(page, 6); await settled(page);
  await expect(page.locator('#time')).toHaveText('00:06');
  await page.locator('#speed').tap();
  await expect(page.locator('#speed')).toHaveAccessibleName('Playback speed: 0.5 times');
  await page.locator('#play').tap();
  await expect.poll(async () => Number(await page.locator('#progress').inputValue())).toBeGreaterThan(6);
  await page.locator('#play').tap();
  await expect(page.locator('#play')).toHaveAccessibleName('Play simulation');
  await page.locator('#replay').tap();
  await expect.poll(async () => Number(await page.locator('#progress').inputValue())).toBeLessThan(6);
  await expect(page.locator('#play')).toHaveAccessibleName('Pause simulation');
  await seekTimeline(page, 0);
  expect(errors).toEqual([]);
});
