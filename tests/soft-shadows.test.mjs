import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const THREE = await import(process.env.SOFT_SHADOWS_THREE_MODULE
  ? pathToFileURL(resolve(process.env.SOFT_SHADOWS_THREE_MODULE)).href : 'three');
import {installSoftSunShadows, fitSunShadowFrustum, getSoftSunShadowMapType} from '../dist/soft-shadows.js';

const fresh = () => ({...THREE, ShaderChunk: {...THREE.ShaderChunk}});
test('environment fits shadows after its final sun reset, not during geometry updates', () => {
  const source=readFileSync(new URL('../dist/simulation.js',import.meta.url),'utf8');
  const environment=source.slice(source.indexOf('function applyEnvironment('),source.indexOf('function updateWorld('));
  assert.ok(environment.indexOf('fitSunShadowFrustum(sun,s.world)')>environment.indexOf('sun.position.set('));
  assert.match(environment,/sun\.target\.position\.set\(0,0,0\)/);
  const cinema=readFileSync(new URL('../dist/cinema.js',import.meta.url),'utf8');
  assert.doesNotMatch(cinema,/fitSunShadowFrustum\(sun/);
});
const sun = () => {
  const light = new THREE.DirectionalLight();
  light.position.set(-40,60,30);
  return light;
};
const bounds = {
  city: [[-85,-20,-77.5],[85,80,77.5]],
  landscape: [[-130,-20,-150],[130,80,50]]
};
const corners = ([min,max]) => min.flatMap((_, i) => i === 0
  ? [min[0],max[0]].flatMap(x => [min[1],max[1]].flatMap(y => [min[2],max[2]].map(z => new THREE.Vector3(x,y,z)))) : []);

test(`patches real r${THREE.REVISION} chunks exactly once, including the ShadowMaterial path`, () => {
  const three = fresh();
  assert.equal(installSoftSunShadows(three), true);
  const once = {...three.ShaderChunk};
  assert.equal(installSoftSunShadows(three), false);
  assert.deepEqual(three.ShaderChunk, once);
  for (const name of ['lights_fragment_begin','shadowmask_pars_fragment']) {
    assert.match(three.ShaderChunk[name], /getSoftSunShadow\( directionalShadowMap/);
    assert.match(three.ShaderChunk[name], /vDirectionalShadowCoord\[ i \], directionalShadowMatrix\[ i \]/);
    assert.match(three.ShaderChunk[name], /getShadow\( spotShadowMap/);
  }
  const original = THREE.ShaderChunk.shadowmap_pars_fragment;
  const patched = three.ShaderChunk.shadowmap_pars_fragment;
  const stockPrefix = original.replace(/\n#endif\s*$/, '');
  assert.ok(patched.startsWith(stockPrefix), 'all original functions, including spot/point filtering, stay intact');
  const injected = patched.slice(stockPrefix.length);
  assert.doesNotMatch(injected, /smoothstep|gl_FragCoord|\btime\b/);
  assert.match(injected, /step\(receiverDepth, a4Depth/);
  if (THREE.REVISION === '186') {
    assert.match(injected, /texture2D\(shadowMap, uv\).r/);
    assert.match(injected, /depth = 1.0 - depth/);
    assert.match(injected, /p.z = 1.0 - p.z/);
    assert.match(injected, /#error A4_r186_PCSS_requires_BasicShadowMap_native_depth/);
    assert.doesNotMatch(injected, /unpackRGBAToDepth/);
  } else {
    assert.match(injected, /unpackRGBAToDepth/);
  }
  assert.match(patched, /blockerDistanceSum \+= depth \* spans.z/);
  assert.match(patched, /receiverDistance - blockerDistance/);
  assert.match(patched, /blockerCount == 0.0/);
  assert.match(patched, /floor\(worldPosition \* 16.0\)/);

});

test('revision, chunk drift and partial installs fail without mutation', () => {
  for (const mutate of [
    t => {t.REVISION = '187';},
    t => {t.ShaderChunk.shadowmap_pars_fragment = 'changed';},
    t => {t.ShaderChunk.shadowmask_pars_fragment = 'changed';},
    t => {t.ShaderChunk.lights_fragment_begin += '\n// A4_SOFT_SUN_PCSS_V2';}
  ]) {
    const three = fresh(); mutate(three);
    const before = {...three.ShaderChunk};
    assert.throws(() => installSoftSunShadows(three), /A4/);
    assert.deepEqual(three.ShaderChunk, before);
  }
});

test('each world fits all eight corners and restores exactly across world switches', () => {
  const light = sun();
  const mapSize = light.shadow.mapSize.clone();
  const direction = light.position.clone().normalize();
  const snapshot = () => [light.shadow.camera.projectionMatrix.toArray(),light.shadow.matrix.toArray()];
  for (const world of ['city','landscape']) {
    assert.equal(fitSunShadowFrustum(light,world), true);
    for (const corner of corners(bounds[world])) {
      const uv = corner.applyMatrix4(light.shadow.matrix);
      assert.ok([uv.x,uv.y,uv.z].every(v => v > 0 && v < 1), `${world}: ${uv.toArray()}`);
    }
    assert.ok(light.position.clone().sub(light.target.position).normalize().distanceTo(direction) < 1e-14);
    assert.deepEqual(light.shadow.mapSize, mapSize);
    assert.equal(light.shadow.radius, -.025);
  }
  fitSunShadowFrustum(light,'city');
  const first = snapshot();
  fitSunShadowFrustum(light,'landscape');
  fitSunShadowFrustum(light,'city');
  // Floating point direction normalization may differ at machine epsilon only.
  snapshot().flat().forEach((v,i) => assert.ok(Math.abs(v-first.flat()[i]) < 1e-12));
  assert.equal(fitSunShadowFrustum(light,'space'), false);
});

test('matrix row reconstruction recovers world positions and receiver/blocker distance', () => {
  const light = sun();
  fitSunShadowFrustum(light,'city');
  const m = light.shadow.matrix.elements;
  const rows = [0,1,2].map(i => new THREE.Vector3(m[i],m[i+4],m[i+8]));
  const spans = rows.map(row => 1/row.length());
  const p = new THREE.Vector3(12,5,-20);
  const uv = p.clone().applyMatrix4(light.shadow.matrix);
  const local = uv.clone().sub(new THREE.Vector3(m[12],m[13],m[14]));
  const recovered = new THREE.Vector3();
  rows.forEach((row,i) => recovered.addScaledVector(row,local.getComponent(i)*spans[i]**2));
  assert.ok(recovered.distanceTo(p) < 1e-10);
  const toLight = light.position.clone().sub(light.target.position).normalize();
  const penumbras = [0,1,10,40].map(separation => {
    const blocker = p.clone().addScaledVector(toLight,separation).applyMatrix4(light.shadow.matrix);
    const actual = (uv.z-blocker.z)*spans[2];
    assert.ok(Math.abs(actual-separation) < 1e-10);
    return .025*Math.max(actual,0);
  });
  assert.ok(penumbras[0] < 1e-10);
  assert.ok(penumbras.every((v,i) => i === 0 || v > penumbras[i-1]));
});

test('custom low bounds tighten city coverage; parent transforms and invalid inputs', () => {
  const light = sun();
  const parent = new THREE.Group(); parent.position.set(20,4,-8); parent.rotation.y=.4;
  parent.add(light,light.target); parent.updateMatrixWorld(true);
  const box = new THREE.Box3(new THREE.Vector3(-85,-2,-77.5),new THREE.Vector3(85,30,77.5));
  fitSunShadowFrustum(light,'city',{bounds:box});
  for (const corner of corners([box.min.toArray(),box.max.toArray()])) {
    const uv = corner.applyMatrix4(light.shadow.matrix);
    assert.ok([uv.x,uv.y,uv.z].every(v => v>0 && v<1));
  }
  const fittedArea = (light.shadow.camera.right-light.shadow.camera.left) * (light.shadow.camera.top-light.shadow.camera.bottom);
  assert.ok(fittedArea < 230*230);
  assert.throws(() => fitSunShadowFrustum(light,'unknown'), /Unknown/);
  assert.throws(() => fitSunShadowFrustum(light,'city',{padding:-1}), /Invalid/);
  assert.throws(() => fitSunShadowFrustum(new THREE.PointLight(),'city'), /directional/);
});


test('simulation position resets cannot drift direction or reverse-scrub fitting', () => {
  const light = sun();
  light.position.set(-90,85,-110);
  fitSunShadowFrustum(light,'city');
  const first = light.shadow.matrix.toArray();
  const initialDirection = light.position.clone().sub(light.target.position).normalize();
  for (let i=0;i<20;i++) {
    light.position.set(-90,85,-110);
    fitSunShadowFrustum(light,i%2 ? 'city' : 'landscape');
    assert.ok(light.position.clone().sub(light.target.position).normalize().distanceTo(initialDirection)<1e-14);
  }
  assert.deepEqual(light.shadow.matrix.toArray(),first);
  const direction = new THREE.Vector3(1,2,3).normalize();
  fitSunShadowFrustum(light,'city',{direction});
  assert.ok(light.position.clone().sub(light.target.position).normalize().distanceTo(direction)<1e-14);
  light.position.set(-90,85,-110);
  fitSunShadowFrustum(light,'city');
  assert.ok(light.position.clone().sub(light.target.position).normalize().distanceTo(direction)<1e-14);
});


test('map type selects readable depth on r186 and retains r170 PCFSoft', () => {
  assert.equal(getSoftSunShadowMapType({...THREE, REVISION:'186'}), THREE.BasicShadowMap);
  assert.equal(getSoftSunShadowMapType({...THREE, REVISION:'170'}), THREE.PCFSoftShadowMap);
  assert.throws(() => getSoftSunShadowMapType({...THREE, REVISION:'187'}), /r170 and r186/);
});

// Opt in only when the shared GPU is idle. Works with the installed revision or
// SOFT_SHADOWS_THREE_MODULE=/absolute/package/build/three.module.js, without an npm bump.
test('isolated Chrome compiles and renders PCSS with native shadow maps', {
  skip: process.env.SOFT_SHADOWS_GPU !== '1', timeout: 60000
}, async () => {
  const {chromium} = await import('@playwright/test');
  const {createServer} = await import('node:http');
  const {readFile} = await import('node:fs/promises');
  const {fileURLToPath} = await import('node:url');
  const {dirname, basename, join} = await import('node:path');
  const modulePath = process.env.SOFT_SHADOWS_THREE_MODULE
    ? resolve(process.env.SOFT_SHADOWS_THREE_MODULE) : fileURLToPath(import.meta.resolve('three'));
  const server = createServer(async (req,res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const routes = {
      '/': '<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>'
    };
    try {
      if (req.url === '/') {res.setHeader('Content-Type','text/html'); res.end(routes['/']); return;}
      const file = req.url === '/soft-shadows.js' ? fileURLToPath(new URL('../dist/soft-shadows.js',import.meta.url))
        : ['/three.module.js','/three.core.js'].includes(req.url) ? join(dirname(modulePath),basename(req.url)) : null;
      if (!file) {res.writeHead(404); res.end(); return;}
      res.setHeader('Content-Type','text/javascript'); res.end(await readFile(file));
    } catch {res.writeHead(500); res.end();}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({channel:'chrome', headless:true});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror',e => errors.push(String(e)));
    page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const results = await page.evaluate(async () => {
      const T = await import('three');
      const S = await import('/soft-shadows.js');
      S.installSoftSunShadows();
      const results = [];
      for (const reversed of T.REVISION === '186' ? [false,true] : [false]) {
        const renderer = new T.WebGLRenderer({reversedDepthBuffer:reversed});
        renderer.setSize(128,128);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = S.getSoftSunShadowMapType();
        const scene = new T.Scene();
        const sun = new T.DirectionalLight('white',3);
        sun.position.set(-8,15,6); sun.castShadow = true;
        sun.shadow.mapSize.set(512,512);
        scene.add(sun,sun.target);
        const bounds = new T.Box3(new T.Vector3(-15,-1,-15),new T.Vector3(15,10,15));
        const fit = () => S.fitSunShadowFrustum(sun,'city',{bounds,angularRadius:.08});
        fit();
        const box = new T.Mesh(new T.BoxGeometry(3,3,3),new T.MeshStandardMaterial());
        box.position.y = 3; box.castShadow = true; scene.add(box);
        const floor = new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial());
        floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
        for (const light of [new T.SpotLight('white',20),new T.PointLight('white',10)]) {
          light.position.set(4,12,0); light.castShadow = true;
          light.shadow.mapSize.set(128,128); scene.add(light);
        }
        const camera = new T.PerspectiveCamera(50,1,.1,100);
        camera.position.set(15,20,20); camera.lookAt(0,0,0);
        const target = new T.WebGLRenderTarget(128,128);
        renderer.setRenderTarget(target);
        const render = () => {
          renderer.render(scene,camera);
          const pixels = new Uint8Array(128*128*4);
          renderer.readRenderTargetPixels(target,0,0,128,128,pixels);
          return pixels;
        };
        const first = render();
        box.position.x = 2; render(); box.position.x = 0;
        sun.position.set(-8,15,6); fit();
        const restored = render();
        sun.shadow.radius = 1;
        const stock = render();
        sun.shadow.radius = -.08;
        // Compile the second patched call site too.
        floor.material.dispose(); floor.material = new T.ShadowMaterial(); render();
        const depth = sun.shadow.map.depthTexture;
        results.push({revision:T.REVISION, reversedRequested:reversed,
          reversedActive:!!renderer.capabilities.reversedDepthBuffer,
          deterministic:first.every((v,i) => v === restored[i]),
          changedChannels:first.reduce((n,v,i) => n + (v !== stock[i]),0),
          nativeDepth:!!depth?.isDepthTexture, comparison:depth?.compareFunction ?? null,
          glError:renderer.getContext().getError(), programs:renderer.info.programs.length});
        scene.traverse(object => {object.geometry?.dispose(); object.material?.dispose(); object.shadow?.dispose();});
        target.dispose(); renderer.dispose(); renderer.forceContextLoss();
      }
      return results;
    });
    assert.deepEqual(errors,[]);
    for (const result of results) {
      assert.ok(result.deterministic,JSON.stringify(result));
      assert.ok(result.changedChannels > 0,JSON.stringify(result));
      assert.equal(result.glError,0);
      if (result.revision === '186') {
        assert.ok(result.nativeDepth);
        assert.equal(result.comparison,null);
      }
    }
    console.log('PCSS Chrome evidence:',JSON.stringify(results));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
