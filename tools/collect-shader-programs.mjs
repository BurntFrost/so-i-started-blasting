import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { QUALITY, SCENES, seekTimeline, settleFrames } from './capture-media.mjs';

const url = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:4186');
// Collection must work before a newly authored shader has a generated node program.
url.searchParams.set('renderer', 'classic');
const manifest = JSON.parse(await readFile(new URL('../build/asset-manifest.json', import.meta.url), 'utf8'));
const moduleURL = manifest['/shader-program.js'];
if (!moduleURL) throw new Error('Build the shader capture helper first.');
const browser = await chromium.launch({channel:'chrome', args:['--enable-webgl','--ignore-gpu-blocklist']});
const programs = new Map(), errors = [];
try {
  for (const quality of ['balanced','high','ultra']) {
    const context = await browser.newContext({...QUALITY[quality], reducedMotion:'reduce'});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url.href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelector('#world')?.dataset.authoredAssets === 'ready');
    for (const [index] of SCENES.entries()) {
      await page.locator(`.scene-card[data-scene="${index}"]`).click();
      await seekTimeline(page, 18);
      await settleFrames(page);
    }
    const captured = await page.evaluate(async path => (await import(path)).captureShaderPrograms(), moduleURL);
    for (const program of captured) {
      const previous = programs.get(program.key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(program)) throw new Error(`Program collision: ${program.key}`);
      programs.set(program.key, program);
    }
    await context.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const result = [...programs.values()].sort((a,b) => a.key.localeCompare(b.key));
  await writeFile(new URL('./tsl-captured-programs.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(`Captured ${result.length} unique custom programs across all 15 scenes and three quality ceilings.`);
} finally {
  await browser.close();
}
