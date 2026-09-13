// A/B capture of the built app. Baseline deliberately fails only the optional atlas.
// npm run serve, then: node tools/capture-explosion.mjs [--motion]
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const motion = process.argv.includes('--motion');
const output = new URL(motion ? '../work/explosion-bake/review/motion/' : '../work/explosion-bake/review/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const report = { captures: [], errors: [], verification: {} };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function seek(page, time) {
  await page.locator('#progress').evaluate((input, value) => {
    input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
  await settle(page);
}
try {
  for (const mode of ['before', 'after']) {
    const page = await browser.newPage({ viewport: motion ? { width: 1000, height: 740 } : { width: 1440, height: 960 }, hasTouch: motion, reducedMotion: 'reduce' });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error' && /THREE|WebGL|shader/i.test(entry.text())) report.errors.push(entry.text()); });
    let requests = 0;
    await page.route('**/*explosion-puff*.webp', route => {
      requests++;
      return mode === 'before' ? route.abort() : route.continue();
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4174');
    await page.locator('#world[data-authored-assets="ready"]').waitFor();
    assert.equal(requests, 0, 'unvisited scenes must not download the atlas');
    await page.locator('.scene-card[data-scene="4"]').click();
    await page.locator(`#world[data-explosion-bake="${mode === 'before' ? 'fallback' : 'ready'}"]`).waitFor();
    if (motion) {
      const directory = new URL(`${mode}/`, output); await mkdir(directory, { recursive: true });
      for (let frame = 0; frame < 36; frame++) {
        await seek(page, 10 + frame / 12);
        await page.locator('#world').screenshot({ path: new URL(`${String(frame).padStart(3, '0')}.png`, directory).pathname });
        assert.equal(await page.locator('#world').getAttribute('data-quality'), 'balanced');
      }
      report.verification[mode] = { frames: 36, fps: 12, timelineStart: 10, quality: 'balanced' };
      await page.close(); continue;
    }
    for (const time of [6, 9, 12, 16, 22]) {
      await seek(page, time);
      const file = new URL(`${mode}-${time}.png`, output).pathname;
      await page.locator('#world').screenshot({ path: file });
      report.captures.push({ mode, time, file, metrics: await page.locator('#world').evaluate(canvas => ({ ...canvas.dataset })) });
    }
    await seek(page, 10);
    const first = digest(await page.locator('#world').screenshot());
    await seek(page, 19); await seek(page, 10);
    assert.equal(digest(await page.locator('#world').screenshot()), first, 'reverse seek must be pixel identical');
    await page.locator('#world').focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await settle(page);
    assert.notEqual(digest(await page.locator('#world').screenshot()), first);
    await page.locator('#world').screenshot({ path: new URL(`${mode}-orbit.png`, output).pathname });
    await page.locator('#reset-camera').click(); await settle(page);
    report.verification[mode] = { lazyRequests: requests, reverseSeekExact: true, orbitChangesView: true };
    await page.setViewportSize({ width: 390, height: 844 });
    await seek(page, 10);
    await page.locator('#world').screenshot({ path: new URL(`${mode}-phone.png`, output).pathname });
    report.verification[mode].phone = await page.locator('#world').evaluate(canvas => ({ ...canvas.dataset }));
    await page.locator('#play').click();
    report.verification[mode].phonePlayback = await page.evaluate(() => new Promise(resolve => {
      const intervals = []; let previous, start;
      function sample(now) {
        if (start === undefined) start = now;
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        if (now - start < 4000) return requestAnimationFrame(sample);
        intervals.sort((a, b) => a - b);
        resolve({ rafMedianMs: intervals[Math.floor(intervals.length * .5)], rafP95Ms: intervals[Math.floor(intervals.length * .95)],
          samples: intervals.length, metrics: { ...document.querySelector('#world').dataset } });
      }
      requestAnimationFrame(sample);
    }));
    await page.locator('#play').click();
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ output: output.pathname, verification: report.verification, errors: report.errors }));
