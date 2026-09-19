import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { particleCells, particleAtlasUniforms, applyParticleAtlas, applyParticlePoints, particleFragmentGLSL } from '../dist/particle-atlas.js';
import { opaqueDepthUniforms } from '../dist/render-kit.js';
import { createCosmic } from '../dist/cosmic.js';
import { normalizeProgram } from '../tools/tsl-normalize.mjs';
const source = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const canvas = () => Object.assign(new EventTarget(), { dataset: {} });

test('atlas mip sampling remains outside per-fragment bounds guards after TSL lowering', () => {
  const source=particleFragmentGLSL.match(/float particleMask\(\)\{[\s\S]*?\n\}/)[0];
  const {ast}=normalizeProgram({name:'atlasDerivativeRegression',source,bindings:{
    gl_PointCoord:'vec2',particleAngle:'float',particleCell:'float',particleAtlas:'sampler2D'}});
  let samples=0;
  function visit(node,conditional=false){
    conditional ||= node.isConditional===true;
    if(node.isFunctionCall&&node.name==='texture2D'){
      samples++;
      assert.equal(conditional,false,'implicit mip derivatives are undefined inside the rotated-cell bounds branch');
    }
    for(const [key,value]of Object.entries(node)){
      if(key==='parent'||key==='linker')continue;
      for(const child of Array.isArray(value)?value:[value])if(child?.isASTNode)visit(child,conditional);
    }
  }
  visit(ast);assert.equal(samples,1,'retain one mip-filtered atlas sample');
});

test('every current factory kind and standalone system has a valid atlas range', async () => {
  for (const file of ['terrestrial', 'cosmic']) {
    const text = await source(`dist/${file}.js`);
    const motion = text.split('const motion = {')[1].split('\n  };')[0];
    for (const [, kind] of motion.matchAll(/^    (\w+): `/gm)) assert.ok(particleCells[kind], `${file}: ${kind}`);
  }
  for (const kind of ['sparks','smoke','spray','snow','foam','windows','debris','stars']) assert.ok(particleCells[kind]);
  for (const [start, count] of Object.values(particleCells)) {
    assert.ok(Number.isInteger(start) && Number.isInteger(count));
    assert.ok(start >= 0 && count > 0 && start + count <= 16);
  }
});

for (const fails of [false, true]) test(`optional atlas loads once per canvas and wakes paused rendering on ${fails ? 'failure' : 'success'}`, async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  let requests = 0, settle;
  THREE.TextureLoader.prototype.loadAsync = url => {
    requests++; assert.equal(url, '/assets/particle-atlas.webp');
    return new Promise((resolve, reject) => { settle = fails ? reject : resolve; });
  };
  try {
    const c = canvas(); let wakes = 0;
    c.addEventListener('atmosphere-ready', () => wakes++);
    const u = particleAtlasUniforms(c);
    assert.equal(particleAtlasUniforms(c), u); assert.equal(requests, 1);
    assert.equal(c.dataset.particleAtlas, 'loading'); assert.equal(u.particleAtlasReady.value, 0);
    assert.equal(u.opaqueDepth, opaqueDepthUniforms(c).opaqueDepth);
    assert.equal(u.opaqueInverseSize, opaqueDepthUniforms(c).opaqueInverseSize);
    settle(fails ? new Error('offline') : new THREE.Texture()); await Promise.resolve();
    assert.equal(wakes, 1); assert.equal(c.dataset.particleAtlas, fails ? 'fallback' : 'ready');
    assert.equal(u.particleAtlasReady.value, fails ? 0 : 1);
    if (fails) assert.equal(u.particleAtlas.value, null);
    else {
      assert.equal(u.particleAtlas.value.colorSpace, THREE.NoColorSpace);
      assert.equal(u.particleAtlas.value.generateMipmaps, true);
      assert.equal(u.particleAtlas.value.minFilter, THREE.LinearMipmapLinearFilter);
    }
    const other = particleAtlasUniforms(canvas()); assert.notEqual(other, u); assert.equal(requests, 2);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('plain dataset stubs tolerate missing DOM and synchronous loader failures', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  try {
    THREE.TextureLoader.prototype.loadAsync = () => { throw new Error('document is not defined'); };
    const sync = {dataset:{}};
    assert.doesNotThrow(() => particleAtlasUniforms(sync));
    assert.equal(sync.dataset.particleAtlas, 'fallback');
    assert.equal(particleAtlasUniforms(sync).particleAtlasReady.value, 0);
    THREE.TextureLoader.prototype.loadAsync = original;
    const plain = {dataset:{}};
    particleAtlasUniforms(plain); await Promise.resolve();
    assert.equal(plain.dataset.particleAtlas, 'fallback');
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('shader augmentation retains original fallback and motion, sharing depth without a prepass', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = () => new Promise(() => {});
  try {
    for (const kind of Object.keys(particleCells)) {
      const motion = 'p=vec3(time,seed.y,seed.z);opacity=seed.w;';
      const body = `float a=seed.x*6.283185;vec3 p;${motion}vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=12.;`;
      const fallback = 'float r=length(gl_PointCoord-.5);gl_FragColor=vec4(tint,(1.-smoothstep(0.,.5,r))*opacity);';
      const m = new THREE.ShaderMaterial({ uniforms: {}, vertexShader: `attribute vec4 seed;uniform float time;varying float opacity;void main(){${body}}`, fragmentShader: `uniform vec3 tint;varying float opacity;void main(){${fallback}}` });
      applyParticleAtlas(m, { canvas: canvas(), kind, motion });
      assert.ok(m.vertexShader.includes(body)); assert.ok(m.fragmentShader.includes(`void particleFallback(){${fallback}}`));
      assert.match(m.fragmentShader, /else\{particleFallback\(\);\}/);
      if (particleCells[kind][0] === 8) assert.match(m.vertexShader, /particleNext\(time\+\.04\)/);
      assert.ok(!m.vertexShader.includes('Math.random'));
    }
    assert.match(particleFragmentGLSL, /if\(opaqueDepthAvailable<\.5\)return 1\./);
    assert.match(particleFragmentGLSL, /gl_FragCoord.xy\*opaqueInverseSize/);
    assert.match(particleFragmentGLSL, /particleViewDepth\(depth\)-particleViewDepth\(gl_FragCoord.z\)/);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('PointsMaterial integration preserves positions, prior patches and a stable index seed', () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = () => new Promise(() => {});
  try {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.Float32BufferAttribute([1,2,3,4,5,6], 3); geometry.setAttribute('position', positions);
    const points = new THREE.Points(geometry, new THREE.PointsMaterial());
    points.material.onBeforeCompile = shader => { shader.uniforms.prior = {value: 1}; };
    applyParticlePoints(points, canvas(), 'snow');
    assert.equal(points.material.depthWrite, false);
    assert.equal(geometry.attributes.position, positions);
    const seeds = geometry.attributes.particleSeed.array.slice(); positions.setXYZ(0, 9, 8, 7);
    assert.deepEqual(geometry.attributes.particleSeed.array, seeds);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader };
    points.material.onBeforeCompile(shader); assert.equal(shader.uniforms.prior.value, 1);
    assert.match(shader.fragmentShader, /diffuseColor.a\*=particleAtlasReady/);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('constructed cosmic starfield uses the shared atlas and preserves one circle fallback', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  const requests = [];
  let rejectAtlas;
  THREE.TextureLoader.prototype.loadAsync = url => {
    requests.push(url);
    return new Promise((resolve, reject) => { rejectAtlas = reject; });
  };
  const scene = new THREE.Scene();
  try {
    const c = canvas(); c.dataset.quality = 'balanced';
    const cosmic = createCosmic({ scene, canvas: c, camera: new THREE.PerspectiveCamera() });
    cosmic.update(16, {id: 'gravity'});
    const starfields = scene.children.filter(object => object.isPoints && object.material.isPointsMaterial);
    assert.equal(starfields.length, 1);
    const stars = starfields[0];
    assert.equal(stars.visible, true);
    assert.equal(stars.material.depthWrite, false);
    assert.equal(stars.material.vertexColors, true);
    assert.equal(stars.geometry.getAttribute('particleSeed')?.count, stars.geometry.getAttribute('position').count);
    assert.deepEqual(requests, ['/assets/particle-atlas.webp']);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader };
    stars.material.onBeforeCompile(shader);
    const shared = particleAtlasUniforms(c);
    assert.equal(shader.uniforms.particleAtlas, shared.particleAtlas);
    assert.equal(shader.uniforms.particleAtlasReady, shared.particleAtlasReady);
    assert.match(stars.material.customProgramCacheKey(), /:particle-atlas:stars$/);
    assert.match(shader.fragmentShader, /particleAtlasReady>\.5\?particleMask\(\)/);
    rejectAtlas(new Error('atlas unavailable')); await Promise.resolve();
    assert.equal(c.dataset.particleAtlas, 'fallback');
    assert.equal(shader.uniforms.particleAtlasReady.value, 0);
    // Both the atlas and the fallback must apply coverage once; composing the old
    // star patch with the helper otherwise multiplies two masks into every star.
    const masks = [...shader.fragmentShader.matchAll(/diffuseColor\.a\s*\*=\s*([^;]+);/g)]
      .map(match => match[1]).filter(expression => expression !== 'particleDepthFade()');
    assert.equal(masks.length, 1, `Star coverage is multiplied more than once: ${masks.join('; ')}`);
    assert.match(masks[0], /1\.-smoothstep\(\.05,\.5,length\(gl_PointCoord-\.5\)\)/);
  } finally {
    THREE.TextureLoader.prototype.loadAsync = original;
    scene.traverse(object => {
      object.geometry?.dispose();
      for (const material of [].concat(object.material || [])) material.dispose();
    });
  }
});

test('checked-in atlas is WebP and matches the reviewed asset baseline', async () => {
  const bytes = await readFile(new URL('../dist/assets/particle-atlas.webp', import.meta.url));
  assert.equal(bytes.toString('ascii',0,4), 'RIFF'); assert.equal(bytes.toString('ascii',8,12), 'WEBP');
  const baseline = JSON.parse(await source('tools/asset-baseline.json')).files['dist/assets/particle-atlas.webp'];
  assert.equal(bytes.length, baseline.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), baseline.sha256);
  assert.ok(bytes.length < 350000);
});

// Opt-in GPU probe uses the existing Playwright dependency; no build or shared server is mutated.
test('WebGL compiles all factory shaders and verifies depth fade, fallback and reverse time', { skip: !process.env.PARTICLE_WEBGL }, async () => {
  const { createServer } = await import('node:http');
  const { chromium } = await import('@playwright/test');
  const root = new URL('../', import.meta.url);
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html');
        res.end('<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>'); return;
      }
      const path = req.url.startsWith('/assets/') ? `/dist${req.url}` : req.url;
      res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'image/webp');
      res.end(await readFile(new URL(`.${path}`, root)));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? {channel: process.env.PLAYWRIGHT_CHANNEL} : {}), args: ['--enable-webgl','--ignore-gpu-blocklist'] });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /THREE|shader|WebGL/.test(message.text())) errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result = await page.evaluate(async () => {
      const THREE = await import('three');
      const { applyParticleAtlas, applyParticlePoints, particleAtlasUniforms } = await import('/dist/particle-atlas.js');
      const { createTerrestrial } = await import('/dist/terrestrial.js');
      const { createCosmic } = await import('/dist/cosmic.js');
      const { scenes } = await import('/dist/scenes.js');
      const canvas = document.createElement('canvas'); canvas.dataset.qualityCeiling = 'high';
      const renderer = new THREE.WebGLRenderer({canvas}); renderer.setSize(64,64);
      const camera = new THREE.PerspectiveCamera(50,1,1,1000), scene = new THREE.Scene();
      const terrestrial = createTerrestrial({scene,canvas,camera,landscape:new THREE.Group()});
      const cosmic = createCosmic({scene,canvas,camera});
      for (const config of scenes) { terrestrial.update(16,config); cosmic.update(16,config); }
      const u = particleAtlasUniforms(canvas);
      if (canvas.dataset.particleAtlas === 'loading') await new Promise(resolve => canvas.addEventListener('atmosphere-ready', resolve, {once:true}));
      const ready = canvas.dataset.particleAtlas;
      let compiled = 0;
      scene.traverse(object => {
        if (!object.isPoints || !object.material.uniforms?.particleAtlas) return;
        const isolated = new THREE.Scene(); isolated.add(new THREE.Points(object.geometry, object.material));
        renderer.compile(isolated,camera); compiled++;
      });
      for (const kind of ['snow','foam','windows','debris']) {
        const points = new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,-10],3)),new THREE.PointsMaterial());
        applyParticlePoints(points,canvas,kind); const isolated = new THREE.Scene(); isolated.add(points); renderer.compile(isolated,camera);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
      geometry.setAttribute('seed',new THREE.Float32BufferAttribute([.31,.42,.53,.64],4));
      const material = new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},tint:{value:new THREE.Color(1,1,1)}},
        vertexShader:'attribute vec4 seed;uniform float time;varying float opacity;void main(){vec3 p=vec3(0.,0.,-10.);opacity=1.;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=48.;}',
        fragmentShader:'uniform vec3 tint;varying float opacity;void main(){gl_FragColor=vec4(tint,(1.-smoothstep(0.,.5,length(gl_PointCoord-.5)))*opacity);}'});
      applyParticleAtlas(material,{canvas,kind:'smoke'});
      const probe = new THREE.Scene(); const particle = new THREE.Points(geometry,material); particle.frustumCulled=false; probe.add(particle);
      const target = new THREE.WebGLRenderTarget(64,64); renderer.setRenderTarget(target);
      const render = time => {material.uniforms.time.value=time;renderer.render(probe,camera);const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);return Array.from(pixels);};
      const sum = pixels => pixels.reduce((a,v,i)=>a+(i%4===0?v:0),0);
      u.opaqueDepthAvailable.value=0;
      const a=render(2); render(8); const b=render(2);
      const hard=sum(a);
      u.opaqueNear.value=1;u.opaqueFar.value=1000;u.opaqueInverseSize.value.set(1/64,1/64);
      const depth = distance => (1000-1000/distance)/999;
      const map=new THREE.DataTexture(new Float32Array([depth(10.5)]),1,1,THREE.RedFormat,THREE.FloatType);map.needsUpdate=true;
      u.opaqueDepth.value=map;u.opaqueDepthAvailable.value=1;
      const soft=sum(render(2));
      map.image.data[0]=depth(9);map.needsUpdate=true;const blocked=sum(render(2));
      map.image.data[0]=1;map.needsUpdate=true;const sky=sum(render(2));
      u.opaqueDepthAvailable.value=0;u.particleAtlasReady.value=0;const fallback=sum(render(2));
      renderer.dispose();target.dispose();map.dispose();
      return {compiled,ready,hard,soft,blocked,sky,fallback,reversible:JSON.stringify(a)===JSON.stringify(b)};
    });
    console.log('Particle WebGL evidence:', result);
    assert.deepEqual(errors, []); assert.ok(result.compiled >= 17); assert.equal(result.ready,'ready');
    assert.ok(result.hard > 0); assert.ok(result.soft > 0 && result.soft < result.hard / 2);
    assert.equal(result.blocked,0);assert.equal(result.sky,result.hard);assert.ok(result.fallback>0);assert.equal(result.reversible,true);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
