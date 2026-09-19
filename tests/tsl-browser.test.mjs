import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { generateRegistry } from '../tools/tsl-registry.mjs';

// Run explicitly: TSL_BROWSER=1 PLAYWRIGHT_CHANNEL=chrome node --test tests/tsl-browser.test.mjs
// Native WebGPU is mandatory when requested; fallback never satisfies that test.
test('every captured raw program compiles/renders on both backends and restores shader time', { skip: process.env.TSL_BROWSER !== '1', timeout: 240000 }, async t => {
  const records = JSON.parse(await readFile(new URL('../tools/tsl-captured-programs.json', import.meta.url), 'utf8'));
  const generated = await readFile(new URL('../dist/node-fields.js', import.meta.url), 'utf8');
  assert.equal(generated, generateRegistry(records), 'generated registry must match checked-in source');
  // Exact pixel probes exercise branch outcomes and by-value storage, not just
  // shader acceptance or deterministic all-black rendering.
  const probeVertex = 'void main(){gl_Position=vec4(position.xy,0.,1.);}';
  const probes = [
    { vertexShader: probeVertex, fragmentShader: 'uniform vec3 origin;float change(vec3 p){p.y+=.25;return p.y;}void main(){vec3 p=origin,q=origin;p.x+=.25;q.y+=.25;gl_FragColor=vec4(origin.x,p.x,change(origin),1.);}', expected: [[64,128,191,255],[64,128,191,255],[64,128,191,255]] },
    { vertexShader: probeVertex, fragmentShader: 'uniform float time;float early(float x){if(x<5.)return .25;float v=.5;if(x<8.){v+=.25;return v;}v+=.5;return v;}void main(){gl_FragColor=vec4(early(time),.5,.25,1.);}', expected: [[64,128,64,255],[191,128,64,255],[64,128,64,255]] },
    { vertexShader: probeVertex, fragmentShader: 'uniform float time;void helper(){if(time<5.){gl_FragColor=vec4(.25,.5,.75,1.);return;}gl_FragColor=vec4(.75,.5,.25,1.);}void main(){helper();if(time<5.)return;gl_FragColor.g=.25;}', expected: [[64,128,191,255],[191,64,64,255],[64,128,191,255]] }
  ];
  const browserModule = generateRegistry([...records, ...probes]);
  const build = path.dirname(fileURLToPath(import.meta.resolve('three/webgpu')));
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/build/three.module.js","three/webgpu":"/build/three.webgpu.js","three/tsl":"/build/three.tsl.js"}}</script>');
      } else if (url.pathname === '/fields.js') {
        response.setHeader('Content-Type', 'text/javascript'); response.end(browserModule);
      } else if (/^\/build\/three\.[\w.]+\.js$/.test(url.pathname)) {
        response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(path.join(build, path.basename(url.pathname))));
      } else { response.writeHead(404); response.end(); }
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--enable-webgpu', '--ignore-gpu-blocklist'] });
  t.after(() => browser.close());
  for (const mode of ['webgl', 'webgpu']) {
    const page = await browser.newPage(), diagnostics = [];
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()); });
    page.on('pageerror', error => diagnostics.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async ({ mode, records }) => {
      const THREE = await import('three/webgpu'), TSL = await import('three/tsl');
      const { getProgram, shaderProgramKey } = await import('/fields.js');
      const renderer = new THREE.WebGPURenderer({ forceWebGL: mode === 'webgl', antialias: false });
      await renderer.init(); renderer.setSize(64, 64);
      renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
      const device = renderer.backend.device, failures = [], results = [];
      let currentKey;
      renderer.debug.onShaderError = (gl, program, vertex, fragment) => failures.push({ key: currentKey, error: [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n') });
      if (device) device.addEventListener('uncapturederror', event => failures.push({ key: currentKey, error: event.error.message }));
      const originalError = console.error, originalWarn = console.warn;
      console.error = (...args) => originalError('[program ' + currentKey + ']', ...args);
      console.warn = (...args) => originalWarn('[program ' + currentKey + ']', ...args);
      const target = new THREE.RenderTarget(64, 64, { type: THREE.UnsignedByteType });
      renderer.setRenderTarget(target);
      const camera = new THREE.PerspectiveCamera(45, 1, .1, 1000); camera.position.z = 2;
      const scene = new THREE.Scene();
      const data = new Uint8Array([32, 64, 128, 255, 96, 160, 224, 255, 224, 96, 32, 255, 160, 224, 64, 255]);
      const texture = new THREE.DataTexture(data, 2, 2); texture.needsUpdate = true;
      const time = TSL.uniform(4);
      function input(type, name) {
        if (name === 'time') return time;
        if (type === 'sampler2D') return TSL.texture(texture);
        if (type === 'mat4') return TSL.uniform(new THREE.Matrix4());
        if (type === 'mat3') return TSL.uniform(new THREE.Matrix3());
        if (type === 'vec2') return TSL.uniform(new THREE.Vector2(.25, .75));
        if (type === 'vec3') return TSL.uniform(new THREE.Vector3(.25, .5, 1));
        if (type === 'vec4') return TSL.uniform(new THREE.Vector4(.25, .5, .75, 1));
        return TSL.uniform(type === 'bool' ? true : 1, type);
      }
      for (const record of records) {
        currentKey = shaderProgramKey(record);
        const before = failures.length;
        if (device) device.pushErrorScope('validation');
        let mesh;
        try {
          const entry = getProgram(record), bindings = { uniforms: {}, attributes: {}, varyings: {}, builtins: {} };
          for (const stage of ['vertex', 'fragment']) for (const [category, values] of Object.entries(entry.interface[stage])) {
            for (const [name, type] of Object.entries(values)) if (!bindings[category][name]) {
              bindings[category][name] = category === 'varyings' ? TSL.varyingProperty(type, name) : input(type, name);
            }
          }
          Object.assign(bindings.attributes, { position: TSL.positionGeometry, normal: TSL.normalGeometry, uv: TSL.uv() });
          Object.assign(bindings.builtins, {
            gl_FragCoord: TSL.vec4(TSL.screenCoordinate.x, TSL.float(64).sub(TSL.screenCoordinate.y), .5, 1),
            gl_PointCoord: TSL.uv(), gl_PointSize: TSL.property('float'), gl_FrontFacing: TSL.frontFacing
          });
          const program = entry.createProgram(bindings);
          const material = new THREE.MeshBasicNodeMaterial({ vertexNode: program.vertex(), fragmentNode: program.fragment(), side: THREE.DoubleSide });
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); mesh.frustumCulled = false; scene.add(mesh);
          await renderer.compileAsync(scene, camera);
          const frames = [];
          for (const value of [4, 7, 4]) {
            time.value = value; renderer.render(scene, camera);
            if (device) await device.queue.onSubmittedWorkDone();
            frames.push(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64));
          }
          if (!frames[0].every((value, i) => value === frames[2][i])) failures.push({ key: currentKey, error: 'Reverse-time pixels changed' });
          if (record.expected) for (let frame = 0; frame < frames.length; frame++) {
            const pixel = Array.from(frames[frame].slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4));
            if (!pixel.every((value, i) => Math.abs(value - record.expected[frame][i]) <= 1)) failures.push({ key: currentKey, error: `Probe frame ${frame}: ${pixel} expected ${record.expected[frame]}`, shader: frame === 0 ? await renderer.debug.getShaderAsync(scene, camera, mesh) : undefined });
          }
        } catch (error) { failures.push({ key: currentKey, error: error.stack }); }
        finally { if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } }
        if (device) { const error = await device.popErrorScope(); if (error) failures.push({ key: currentKey, error: error.message }); }
        results.push({ key: currentKey, passed: failures.length === before });
      }
      const adapter = device ? { vendor: device.adapterInfo?.vendor, architecture: device.adapterInfo?.architecture, isFallbackAdapter: device.adapterInfo?.isFallbackAdapter } : null;
      target.dispose(); texture.dispose(); renderer.dispose(); console.error = originalError; console.warn = originalWarn;
      return { backend, adapter, failures, results };
    }, { mode, records: [...records, ...probes] });
    t.diagnostic(JSON.stringify({ mode, backend: result.backend, adapter: result.adapter, count: result.results.length, failures: result.failures, diagnostics }));
    await page.close();
    assert.equal(result.backend, mode, 'must execute requested backend');
    assert.equal(result.results.length, records.length + probes.length);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(diagnostics, []);
  }
});
