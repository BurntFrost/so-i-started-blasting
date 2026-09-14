// Capture the actual built renderer for visual and local-vision review.
// Run against npm run serve: node tools/capture-media.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// CAPTURE_SCALE=2 renders native Retina pixels and writes to work/media-review-2x for 4K review.
const scale = Number(process.env.CAPTURE_SCALE || 1);
const output = new URL(`../work/media-review${scale > 1 ? `-${scale}x` : ''}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: scale, hasTouch: false, reducedMotion: 'reduce' });
const errors = [], frames = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', entry => { if (entry.type() === 'error' && /THREE|WebGL|shader/i.test(entry.text())) errors.push(entry.text()); });
try {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4174');
  await page.locator('#world[data-authored-assets="ready"]').waitFor();
  for (const [index, seconds, name] of [[0, 16, 'alien-impact'], [1, 22, 'tsunami'], [2, 24, 'superstorm'], [3, 22, 'visitation'], [4, 12, 'nuclear'], [7, 18, 'solar'], [8, 18, 'asteroid'], [9, 12, 'black-hole'],
    [10, 17, 'tornado'], [11, 20, 'eruption'], [12, 15, 'debris-cascade'], [13, 23, 'jupiter']]) {
    await page.locator(`.scene-card[data-scene="${index}"]`).click();
    await page.locator('#progress').evaluate((input, time) => {
      input.value = String(time); input.dispatchEvent(new Event('input', { bubbles: true }));
    }, seconds);
    await page.waitForFunction(() => !['loading'].includes(document.querySelector('#world').dataset.nebulaTexture));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = new URL(`${name}.png`, output).pathname;
    await page.locator('#player').screenshot({ path: file });
    frames.push({ name, seconds, file, metrics: await page.locator('#world').evaluate(canvas => ({ ...canvas.dataset })) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.scene-card[data-scene="0"]').click();
  await page.screenshot({ path: new URL('phone.png', output).pathname, fullPage: true });
  await writeFile(new URL('capture.json', output), JSON.stringify({ frames, errors }, null, 2));
  console.log(JSON.stringify({ screenshots: frames.length + 1, errors, output: output.pathname }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
