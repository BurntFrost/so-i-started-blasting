import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as bundleFixture } from 'esbuild';
import { scenes } from '../dist/scenes.js';
import { seekTimeline, settleFrames, MOTION_STATUS, waitForSceneMotion } from '../tools/capture-media.mjs';

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
  page.on('console',m=>{
    if(m.text().startsWith('Optional asset '))console.log(m.text());
    // ANGLE's software backend can flush an internal render pass early. This
    // performance notice is not a shader/validation error or a context loss.
    const queueNotice=m.type()==='warning'&&/GL Driver Message \(OpenGL, Performance, [^)]*\): Running out of reserved outsideRenderPass queueSerial\. ending renderPass now\./.test(m.text());
    if(!queueNotice&&['error','warning'].includes(m.type())&&/THREE|shader|WebGPU|WebGL|WGSL|TSL/i.test(m.text()))errors.push(m.text());
  });
  await page.goto(`/?renderer=${backend}`,{waitUntil:'domcontentloaded'});
  const canvas=page.locator('#world');
  await expect(canvas).toHaveAttribute('data-backend',backend);
  await expect(canvas).toHaveAttribute('data-render-state','ready');
  await expect(canvas).toHaveAttribute('data-authored-assets','ready');
  await expect(canvas).toHaveAttribute('data-particle-atlas',/ready|fallback/);
  await expect(canvas).toHaveAttribute('data-weather-texture',/ready|fallback/);
    await page.locator(`.scene-card[data-scene="${index}"]`).click();
    await expect(canvas).toHaveAttribute('data-scene',scene.id);
    await waitForSceneMotion(page,scene.id);
    if(scene.space)await expect(canvas).toHaveAttribute('data-nebula-texture',/ready|fallback/);
    if(scene.id==='terminator-2')await expect(canvas).toHaveAttribute('data-explosion-bake',/ready|fallback/);
    if(scene.id==='twister')await expect(canvas).toHaveAttribute('data-twister-bake',/ready|fallback/);
    if(scene.id==='deep-impact') {
      await expect(canvas).toHaveAttribute('data-impact-mist',/ready|fallback/);
      await expect(canvas).toHaveAttribute('data-impact-wave',/ready|fallback/);
    }
    if(scene.id==='evangelion')await expect(canvas).toHaveAttribute('data-at-field-texture',/ready|fallback/);
    for(const t of [6,14,22,27,18]){await seekTimeline(page,t);await settleFrames(page);}
    const image=await captureWorld(canvas);
    await expectVisibleWorld(page,image,scene.id);
    const before=hash(image);
    await seekTimeline(page,25);await settleFrames(page);
    const later=hash(await captureWorld(canvas));
    await seekTimeline(page,18);await settleFrames(page);
    const restored=await captureWorld(canvas);
    if(hash(restored)!==before){
      await info.attach('world-before',{body:image,contentType:'image/png'});
      await info.attach('world-restored',{body:restored,contentType:'image/png'});
      await info.attach('render-state',{body:JSON.stringify(await canvas.evaluate(e=>({...e.dataset}))),contentType:'application/json'});
    }
    expect(hash(restored),`${scene.id} reverse pixels`).toBe(before);
    expect(later,`${scene.id} timeline changes image`).not.toBe(before);
    if(MOTION_STATUS[scene.id]) {
      await canvas.focus();await page.keyboard.press('ArrowRight');await canvas.blur();await settleFrames(page);
      expect(hash(await captureWorld(canvas)),`${scene.id} paused orbit changes the view`).not.toBe(before);
      await expect(page.locator('#time')).toHaveText('00:18');
      await page.locator('#reset-camera').click();await settleFrames(page);
      await expect(page.locator('#time')).toHaveText('00:18');
    }
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
    await waitForSceneMotion(page,scene.id);
    if(scene.id==='deep-impact')await expect(canvas).toHaveAttribute('data-impact-wave',/ready|fallback/);
    await seekTimeline(page,18);await settleFrames(page);
    expect(Number(await canvas.getAttribute('data-triangles')),`${scene.id} phone triangles`).toBeLessThan(150000);
  }
  await expectVisibleWorld(page,await captureWorld(canvas),'phone');
  } finally {await context.close();}
});

test('native baked motion deforms after a rendered fallback and restores isolated reverse pixels', async ({ page }, info) => {
  const backend = info.project.metadata.backend, errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|GPU|WebGL|shader|validation/i.test(message.text())) errors.push(message.text());
  });
  // The optimized site tree-shakes Three into private shared chunks. This test-only
  // entry keeps the production helper and pinned engine in one module realm.
  const fixture = await bundleFixture({
    absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
    stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), sourcefile: 'motion-gpu-fixture.js', contents: `
      import * as THREE from 'three/webgpu';
      import { createBakedMotion } from './dist/baked-motion.js';
      const canvas = document.querySelector('canvas');
      const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: new URL(location.href).searchParams.get('backend') === 'webgl', antialias: false });
      await renderer.init(); renderer.setPixelRatio(1); renderer.setSize(512, 512);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
      const camera = new THREE.OrthographicCamera(-75, 75, 75, -75, .1, 500);
      camera.position.set(120, 70, 180); camera.lookAt(0, 48, 0);
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), material); scene.add(mesh);
      const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      renderer.render(scene, camera); const fallbackDraws = renderer.info.render.drawCalls; await settle();
      if (__DISABLE_MORPH_INVALIDATION__) Object.defineProperty(material, 'needsUpdate', { set() {} });
      const manifest = await (await fetch('/asset-manifest.json')).json();
      const url = manifest['/assets/tornado-motion.glb'];
      if (!url) throw new Error('Built tornado motion asset is missing');
      const motion = createBakedMotion({ url, targets: { Funnel: mesh }, canvas, statusKey: 'motion' });
      window.motionFixture = {
        backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl',
        fallbackDraws,
        async adopt() { motion.update(0); await motion.ready; return canvas.dataset.motion; },
        async pose(time) { motion.update(time); renderer.render(scene, camera); await settle(); },
        dispose() { renderer.dispose(); mesh.geometry.dispose(); material.dispose(); }
      };
    ` },
    bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
    define: { __DISABLE_MORPH_INVALIDATION__: String(process.env.TEST_DISABLE_MORPH_INVALIDATION === '1') },
  });
  await page.route(/\/__motion-fixture(?:\?|$)/, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0;background:#000}canvas{display:block}</style><canvas id="fixture"></canvas><script type="module" src="/__motion-fixture.js"></script>' }));
  await page.route('**/__motion-fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: fixture.outputFiles[0].text }));
  const baseURL = info.project.use.baseURL || process.env.TEST_BASE_URL || 'http://127.0.0.1:4174';
  await page.goto(new URL(`/__motion-fixture?backend=${backend}`, baseURL).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.motionFixture);
  const canvas = page.locator('#fixture');
  expect(await page.evaluate(() => window.motionFixture.backend)).toBe(backend);
  expect(await page.evaluate(() => window.motionFixture.fallbackDraws)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.motionFixture.adopt())).toBe('ready');
  const shot = async time => { await page.evaluate(time => window.motionFixture.pose(time), time); return canvas.screenshot(); };
  try {
    const initial = await shot(0), deformed = await shot(18);
    const changed = await page.evaluate(async images => {
      const pixels = await Promise.all(images.map(async data => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
        context.drawImage(bitmap, 0, 0); bitmap.close(); return context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
      }));
      let count = 0;
      for (let i = 0; i < pixels[0].length; i += 4) if (pixels[0].subarray(i, i + 3).some((channel, j) => Math.abs(channel - pixels[1][i + j]) > 8)) count++;
      return count;
    }, [initial.toString('base64'), deformed.toString('base64')]);
    if (changed <= 2000) {
      await info.attach('isolated-pose-0', { body: initial, contentType: 'image/png' });
      await info.attach('isolated-pose-18', { body: deformed, contentType: 'image/png' });
    }
    expect(changed, 'actual loaded geometry changes substantially with a fixed camera and no animated background').toBeGreaterThan(2000);
    expect(hash(await shot(0)), 'the isolated loaded mesh returns to identical pixels').toBe(hash(initial));
    expect(errors).toEqual([]);
  } finally { await page.evaluate(() => window.motionFixture.dispose()); }
});
