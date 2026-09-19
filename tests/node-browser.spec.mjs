import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { scenes } from '../dist/scenes.js';
import { seekTimeline, settleFrames } from '../tools/capture-media.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const captureWorld=canvas=>canvas.screenshot({style:'body * { visibility:hidden!important } #world { visibility:visible!important }'});
async function expectVisibleWorld(page, bytes, scene) {
  const fraction = await page.evaluate(async encoded => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 32) visible++;
    }
    bitmap.close();
    return visible / (pixels.length / 4);
  }, bytes.toString('base64'));
  // Film grain alone changes hashes and reverses exactly even over a black frame.
  expect(fraction, `${scene} must contain visible scene pixels beyond film grain`).toBeGreaterThan(.01);
}
// Isolate shader/device allocations by scene. This also avoids workstation-managed
// Chrome instances expiring while a long all-scenes check is still running.
const test=base.extend({
  page:async({playwright,launchOptions,viewport,hasTouch,reducedMotion},use)=>{
    const browser=await playwright.chromium.launch(launchOptions);
    try {
      const context=await browser.newContext({viewport,hasTouch,reducedMotion});
      await use(await context.newPage());
    } finally {await browser.close();}
  }
});
for(const [index,scene] of scenes.entries())test(`native ${scene.id} renders and restores exact reverse pixels`, async ({page},info)=>{
  const backend=info.project.metadata.backend,errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&/THREE|shader|WebGPU|WebGL|WGSL|TSL/i.test(m.text()))errors.push(m.text());});
  await page.goto(`/?renderer=${backend}`,{waitUntil:'domcontentloaded'});
  const canvas=page.locator('#world');
  await expect(canvas).toHaveAttribute('data-backend',backend);
  await expect(canvas).toHaveAttribute('data-render-state','ready');
  await expect(canvas).toHaveAttribute('data-authored-assets','ready');
  await expect(canvas).toHaveAttribute('data-particle-atlas',/ready|fallback/);
    await page.locator(`.scene-card[data-scene="${index}"]`).click();
    await expect(canvas).toHaveAttribute('data-scene',scene.id);
    if(scene.id==='terminator-2')await expect(canvas).toHaveAttribute('data-explosion-bake',/ready|fallback/);
    if(scene.id==='evangelion')await expect(canvas).toHaveAttribute('data-at-field-texture',/ready|fallback/);
    for(const t of [6,14,22,27,18]){await seekTimeline(page,t);await settleFrames(page);}
    const image=await captureWorld(canvas);
    await expectVisibleWorld(page,image,scene.id);
    const before=hash(image);
    await seekTimeline(page,25);await settleFrames(page);
    const later=hash(await captureWorld(canvas));
    await seekTimeline(page,18);await settleFrames(page);
    expect(hash(await captureWorld(canvas)),`${scene.id} reverse pixels`).toBe(before);
    expect(later,`${scene.id} timeline changes image`).not.toBe(before);
    expect(errors,`${scene.id} shader errors`).toEqual([]);
    console.log(`${backend}: ${scene.id} renders and reverses exactly`);
  expect(errors).toEqual([]);
});

test('phone startup preserves the physical primitive budget with instanced particles', async ({browser},info)=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  try {
  const page=await context.newPage(),backend=info.project.metadata.backend;
  await page.goto(`/?renderer=${backend}`,{waitUntil:'domcontentloaded'});
  const canvas=page.locator('#world');
  await expect(canvas).toHaveAttribute('data-render-state','ready');
  await expect(canvas).toHaveAttribute('data-authored-assets','ready');
  await expect(canvas).toHaveAttribute('data-backend',backend);
  // The physical primitive budget includes both triangles of each particle quad.
  for(const [index,scene] of scenes.entries()) {
    await page.locator(`.scene-card[data-scene="${index}"]`).click();
    await seekTimeline(page,18);await settleFrames(page);
    expect(Number(await canvas.getAttribute('data-triangles')),`${scene.id} phone triangles`).toBeLessThan(150000);
  }
  await expectVisibleWorld(page,await captureWorld(canvas),'phone');
  } finally {await context.close();}
});
