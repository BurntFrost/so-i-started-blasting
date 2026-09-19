// Compare cold-context startup on a phone-sized viewport, using the local host GPU.
// This is a repeatable desktop proxy, not a physical-phone performance claim.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4186';
const output = resolve(process.argv[2] || 'work/renderer-startup');
const results = [];
for (const backend of ['classic', 'webgl', 'webgpu']) {
  for (let sample = 0; sample < 3; sample++) {
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('#world')?.dataset.renderState === 'ready') {
            window.__firstFrameMs = performance.now(); observer.disconnect();
          }
        });
        observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-render-state'] });
      });
      const url = new URL(base); url.searchParams.set('renderer', backend);
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Number.isFinite(window.__firstFrameMs));
      const result = await page.evaluate(() => ({
        firstFrameMs: Math.round(window.__firstFrameMs),
        backend: document.querySelector('#world').dataset.backend,
        quality: document.querySelector('#world').dataset.quality,
        scriptBytes: performance.getEntriesByType('resource').filter(entry => /\.js(?:\?|$)/.test(entry.name))
          .reduce((sum, entry) => sum + entry.decodedBodySize, 0)
      }));
      if (errors.length) throw new Error(errors.join('\n'));
      results.push({ requestedBackend: backend, sample: sample + 1, ...result });
      console.log(JSON.stringify(results.at(-1)));
    } finally { await browser.close(); }
  }
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'startup.json'), JSON.stringify({
  environment: 'Local Chrome, desktop GPU, 390x844 touch viewport, cold browser contexts; no network or CPU throttling',
  results
}, null, 2) + '\n');
