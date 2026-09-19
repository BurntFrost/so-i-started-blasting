import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

// Use an unpacked r186 package before the shared dependency bump; never modify node_modules.
const build = process.env.NODE_SHADOWS_THREE_ROOT
  ? join(resolve(process.env.NODE_SHADOWS_THREE_ROOT),'build')
  : dirname(fileURLToPath(import.meta.resolve('three')));
const THREE = await import(pathToFileURL(join(build,'three.webgpu.js')).href);
const ready = THREE.REVISION === '186';
const source = await readFile(new URL('../dist/node-shadows.js',import.meta.url),'utf8');
const resolvedSource = source.replace("'three/webgpu'",JSON.stringify(pathToFileURL(join(build,'three.webgpu.js')).href))
  .replace("'three/tsl'",JSON.stringify(pathToFileURL(join(build,'three.tsl.js')).href))
  .replace("'./soft-shadows.js'",JSON.stringify(new URL('../dist/soft-shadows.js',import.meta.url).href));
const api = ready ? await import(`data:text/javascript;base64,${Buffer.from(resolvedSource).toString('base64')}`) : null;
const options = {skip:ready ? false : 'Requires r186; set NODE_SHADOWS_THREE_ROOT to the unpacked package.'};

test('installs once per sun and preserves all other light and renderer paths',options,() => {
  const sun = new THREE.DirectionalLight(), spot = new THREE.SpotLight(), other = new THREE.DirectionalLight();
  const original = [spot.shadow.filterNode,other.shadow.filterNode];
  assert.equal(api.installNodeSunShadows(sun),true);
  const filter = sun.shadow.filterNode;
  assert.equal(typeof filter,'function');
  assert.equal(api.installNodeSunShadows(sun,{angularRadius:.04}),false);
  assert.equal(sun.shadow.filterNode,filter);
  assert.equal(sun.shadow.radius,-.04);
  assert.deepEqual([spot.shadow.filterNode,other.shadow.filterNode],original);
  assert.throws(() => api.installNodeSunShadows(spot),/directional/);
  assert.throws(() => api.installNodeSunShadows(sun,{angularRadius:NaN}),/angular/);
  other.shadow.filterNode = () => {};
  assert.throws(() => api.installNodeSunShadows(other),/different shadow filter/);
});

test('reuses the backend-agnostic fitter with stable direction and native [0,1] depth',options,() => {
  for (const coordinateSystem of [THREE.WebGLCoordinateSystem,THREE.WebGPUCoordinateSystem]) {
    const sun = new THREE.DirectionalLight();
    sun.position.set(-90,85,-110);
    sun.shadow.camera.coordinateSystem = coordinateSystem;
    api.installNodeSunShadows(sun);
    api.fitSunShadowFrustum(sun,'city');
    const first = sun.shadow.matrix.toArray();
    api.fitSunShadowFrustum(sun,'landscape');
    sun.position.set(-90,85,-110); api.fitSunShadowFrustum(sun,'city');
    assert.deepEqual(sun.shadow.matrix.toArray(),first);
    for (const x of [-85,85]) for (const y of [-20,80]) for (const z of [-77.5,77.5]) {
      const p = new THREE.Vector3(x,y,z).applyMatrix4(sun.shadow.matrix);
      assert.ok(p.toArray().every(v => v>0 && v<1));
    }
  }
});

test('native forward/reversed depth recovers the same receiver-blocker separation',options,() => {
  for (const coordinateSystem of [THREE.WebGLCoordinateSystem,THREE.WebGPUCoordinateSystem]) {
    for (const reversed of [false,true]) {
      const sun = new THREE.DirectionalLight(); sun.position.set(-90,85,-110);
      sun.shadow.camera.coordinateSystem = coordinateSystem;
      // This is the flag r186's renderer sets on its shadow cameras.
      sun.shadow.camera._reversedDepth = reversed;
      api.fitSunShadowFrustum(sun,'city');
      const camera = sun.shadow.camera;
      const receiver = new THREE.Vector3(12,5,-20);
      const direction = sun.position.clone().sub(sun.target.position).normalize();
      const canonical = point => {
        const native = point.applyMatrix4(sun.shadow.matrix).z;
        return reversed ? 1-native : native;
      };
      const receiverDepth = canonical(receiver.clone());
      for (const separation of [0,1,10,40]) {
        const blockerDepth = canonical(receiver.clone().addScaledVector(direction,separation));
        const distance = (receiverDepth-blockerDepth)*(camera.far-camera.near);
        assert.ok(Math.abs(distance-separation)<1e-10);
        const radius = .025*Math.max(distance,0);
        assert.ok(Math.abs(radius-separation*.025)<1e-10);
      }
    }
  }
});

test('invalid settings and filter conflicts leave the light unchanged',options,() => {
  const sun = new THREE.DirectionalLight();
  const existing = () => {};
  sun.shadow.filterNode = existing;
  const radius = sun.shadow.radius;
  assert.throws(() => api.installNodeSunShadows(sun),/different/);
  assert.equal(sun.shadow.radius,radius);
  assert.equal(sun.shadow.filterNode,existing);
  sun.shadow.filterNode = null;
  for (const angularRadius of [0,-1,Infinity,NaN]) {
    assert.throws(() => api.installNodeSunShadows(sun,{angularRadius}),/angular/);
    assert.equal(sun.shadow.radius,radius);
    assert.equal(sun.shadow.filterNode,null);
  }
});

test('raw sampling is configured synchronously on the sun texture only; VSM rejected',options,() => {
  const sun = new THREE.DirectionalLight(); api.installNodeSunShadows(sun);
  const depth = new THREE.DepthTexture(16,16);
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = depth.magFilter = THREE.LinearFilter;
  const other = new THREE.DepthTexture(16,16); other.compareFunction = THREE.LessEqualCompare;
  sun.shadow.filterNode({depthTexture:depth,shadow:sun.shadow});
  assert.equal(depth.compareFunction,null);
  assert.equal(depth.minFilter,THREE.NearestFilter);
  assert.equal(depth.magFilter,THREE.NearestFilter);
  assert.equal(other.compareFunction,THREE.LessEqualCompare);
  assert.throws(() => sun.shadow.filterNode({depthTexture:new THREE.Texture(),shadow:sun.shadow}),/VSM/);
});

test('filter is time independent, uses native loads and leaves intensity to ShadowNode',() => {
  assert.doesNotMatch(source,/\btime\b|screenCoordinate|Math.random|smoothstep|ShaderChunk/);
  assert.match(source,/textureLoad\(depthTexture, pixel\)/);
  assert.match(source,/receiverDistance.sub\(blockerDistance\)/);
  assert.match(source,/world.mul\(16\).floor\(\)/);
});

test('isolated real Chrome runs WebGPU and forceWebGL PCSS, forward and reversed depth',{
  skip:process.env.NODE_SHADOWS_GPU !== '1', timeout:90000
},async () => {
  assert.ok(ready,'GPU test requires r186');
  const {createServer} = await import('node:http');
  const {chromium} = await import('@playwright/test');
  const server = createServer(async (req,res) => {
    if (req.url === '/favicon.ico') {res.writeHead(204); res.end(); return;}
    try {
      if (req.url === '/') {
        res.setHeader('Content-Type','text/html');
        res.end('<script type="importmap">{"imports":{"three":"/three.webgpu.js","three/webgpu":"/three.webgpu.js","three/tsl":"/three.tsl.js"}}</script>'); return;
      }
      const file = ['/three.webgpu.js','/three.tsl.js','/three.core.js'].includes(req.url)
        ? join(build,req.url.slice(1)) : ['/node-shadows.js','/soft-shadows.js'].includes(req.url)
          ? new URL(`../dist${req.url}`,import.meta.url) : null;
      if (!file) {res.writeHead(404); res.end(); return;}
      res.setHeader('Content-Type','text/javascript'); res.end(await readFile(file));
    } catch {res.writeHead(500); res.end();}
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser = await chromium.launch({headless:true,channel:'chrome'});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror',e => errors.push(String(e)));
    page.on('console',m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const results = await page.evaluate(async () => {
      const T = await import('three/webgpu');
      const S = await import('/node-shadows.js');
      const results = [];
      for (const forceWebGL of [false,true]) for (const reversedDepthBuffer of [false,true]) {
        const renderer = new T.WebGPURenderer({forceWebGL,reversedDepthBuffer});
        renderer.setSize(128,128); await renderer.init();
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
        const device = renderer.backend.device;
        device?.pushErrorScope('validation');
        const scene = new T.Scene();
        const sun = new T.DirectionalLight('white',3);
        sun.position.set(-8,15,6); sun.castShadow = true; sun.shadow.mapSize.set(512,512);
        scene.add(sun,sun.target);
        S.installNodeSunShadows(sun,{angularRadius:.08});
        const bounds = new T.Box3(new T.Vector3(-15,-1,-15),new T.Vector3(15,10,15));
        const fit = () => S.fitSunShadowFrustum(sun,'city',{bounds,angularRadius:.08}); fit();
        const box = new T.Mesh(new T.BoxGeometry(3,3,3),new T.MeshStandardNodeMaterial());
        box.position.y=3; box.castShadow=true; scene.add(box);
        const floor = new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardNodeMaterial());
        floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
        const lights = [new T.SpotLight('white',20),new T.PointLight('white',10)];
        for (const light of lights) {
          light.position.set(4,12,0); light.castShadow=true; light.shadow.mapSize.set(128,128); scene.add(light);
        }
        const camera = new T.PerspectiveCamera(50,1,.1,100);
        camera.position.set(15,20,20); camera.lookAt(0,0,0);
        const target = new T.RenderTarget(128,128); renderer.setRenderTarget(target);
        const render = async () => {
          // ShadowNode caches maps per animation frame, not per render() call.
          // Scrub samples must run on distinct RAF ticks to exercise fresh maps.
          await new Promise(requestAnimationFrame);
          await renderer.renderAsync(scene,camera);
          return Array.from(await renderer.readRenderTargetPixelsAsync(target,0,0,128,128));
        };
        const shaders = await renderer.debug.getShaderAsync(scene,camera,floor);
        // Initialize renderer-owned camera depth conventions and render targets,
        // then take the reference frame after refitting with those conventions.
        await render(); fit();
        const a = await render();
        box.position.x=2; await render(); box.position.x=0;
        sun.position.set(-8,15,6); fit(); const b = await render();
        // Keep the same TSL program: angularRadius=0 is the contact/hard-shadow limit.
        sun.shadow.radius=0; const hard = await render(); sun.shadow.radius=-.08;
        let nativeMode = null;
        if (forceWebGL) {
          const gl = renderer.backend.gl;
          const state = renderer.backend.state;
          const texture = renderer.backend.get(sun.shadow.map.depthTexture).textureGPU;
          state.bindTexture(gl.TEXTURE_2D,texture);
          nativeMode = gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE);
        }
        const validation = await device?.popErrorScope();
        results.push({forceWebGL,reversedRequested:reversedDepthBuffer,reversedActive:renderer.reversedDepthBuffer,
          webgpu:!!renderer.backend.isWebGPUBackend,webgl:!!renderer.backend.isWebGLBackend,
          restoreDiff:a.reduce((n,v,i)=>n+(v!==b[i]),0),
          deterministic:a.every((v,i)=>v===b[i]),changedChannels:a.reduce((n,v,i)=>n+(v!==hard[i]),0),
          nativeMode,sunCompare:sun.shadow.map.depthTexture.compareFunction,
          otherCompare:lights.map(l=>l.shadow.map.depthTexture.compareFunction),
          rawLoads:(shaders.fragmentShader.match(/(?:textureLoad|texelFetch)\(/g)||[]).length,
          validation:validation?.message || null,
          glError:renderer.backend.isWebGLBackend ? renderer.backend.gl.getError() : null});
        scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();o.shadow?.dispose();});
        target.dispose(); renderer.dispose();
      }
      return results;
    });
    console.log('Node PCSS GPU evidence:',JSON.stringify(results));
    assert.deepEqual(errors,[]);
    for (const r of results) {
      assert.equal(r.webgpu,!r.forceWebGL,JSON.stringify(r));
      assert.equal(r.webgl,r.forceWebGL);
      assert.equal(r.reversedActive,r.reversedRequested);
      assert.ok(r.deterministic,JSON.stringify(r));
      assert.ok(r.changedChannels>0,JSON.stringify(r));
      assert.equal(r.sunCompare,null);
      assert.ok(r.otherCompare.every(v=>v!==null),'Other lights retain comparison sampling');
      assert.equal(r.rawLoads,32,'Exactly 16 blocker and 16 filter depth loads');
      assert.equal(r.validation,null);
      if (r.forceWebGL) {assert.equal(r.glError,0); assert.equal(r.nativeMode,0);}
    }
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
});
