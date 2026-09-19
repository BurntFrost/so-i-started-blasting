import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WebGPURenderer, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshStandardNodeMaterial,
  NodeMaterial, QuadMesh, Texture, RenderTarget, Color, Vector3, Vector4, InstancedMesh, Matrix4,
  AgXToneMapping, SRGBColorSpace
} from 'three/webgpu';
import { texture, vec2, vec4, uv, positionLocal } from 'three/tsl';
import { createNodePipeline, shaftMaskNode, shaftBlurNode, SHAFT_STEPS } from '../dist/node-pipeline.js';
import { opaqueDepthUniforms } from '../dist/render-kit.js';
import { defaultGrade } from '../dist/scene-config.js';
import { attachSurface, createSurfaceMaterial } from '../dist/node-surfaces.js';

// Real r186 node builders, but NO renderer.init(), GPU device or browser. These
// tests generate both shader languages on the CPU; they do not compile on a GPU.
function cpuRenderer(forceWebGL = false) {
  const canvas = { width: 1921, height: 1081, style: {}, dataset: {},
    addEventListener() {}, setAttribute() {}, getContext() { throw new Error('GPU access forbidden in unit tests'); } };
  const renderer = new WebGPURenderer({ canvas, forceWebGL });
  renderer.backend.capabilities = { getUniformBufferLimit: () => 65536 };
  renderer.hasFeature = () => false;
  renderer.hasCompatibility = () => true;
  if (forceWebGL) {
    renderer.backend.extensions = { has: () => false, get: () => null };
    renderer.backend.state = { setScissorTest() {} };
  }
  else renderer.backend.utils = { getTextureSampleData: () => ({ primarySamples: 1 }) };
  renderer.toneMapping = AgXToneMapping; renderer.outputColorSpace = SRGBColorSpace;
  return { renderer, canvas };
}

function build(renderer, material, camera = new PerspectiveCamera()) {
  const mesh = new QuadMesh(material);
  const builder = renderer.backend.createNodeBuilder(mesh, renderer);
  builder.camera = camera; builder.scene = new Scene();
  builder.build();
  return builder;
}

function fixture(forceWebGL = false) {
  const { renderer, canvas } = cpuRenderer(forceWebGL);
  const scene = new Scene(), camera = new PerspectiveCamera(45, 1921 / 1081, .1, 1600);
  camera.layers.enable(1); camera.position.set(1, 2, 10); camera.lookAt(0, 0, 0);
  const depth = opaqueDepthUniforms(canvas), draws = [], surfaces = [];
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardNodeMaterial());
  mesh.material.positionNode = positionLocal.add(vec4(0, 1, 0, 0).xyz);
  mesh.userData.ssrReceiver = true; scene.add(mesh);
  const effect = new Mesh(mesh.geometry, mesh.material); effect.layers.set(1); scene.add(effect);
  renderer.renderObject = (object, scene, camera, geometry, material) => { surfaces.push({ object, material }); };
  renderer.render = (object, drawCamera) => {
    draws.push({ object, target: renderer.getRenderTarget(), mask: drawCamera.layers.mask, depthAvailable: depth.opaqueDepthAvailable.value });
    if (object.isScene) {
      object.traverseVisible(child => {
        if (child.isMesh && child.layers.test(drawCamera.layers)) renderer.getRenderObjectFunction()?.(child, object, drawCamera, child.geometry, child.material, null, null);
      });
    }
  };
  const pipeline = createNodePipeline({ renderer, scene, camera, canvas, depth });
  return { renderer, scene, camera, canvas, depth, pipeline, draws, surfaces, mesh, effect };
}

for (const forceWebGL of [false, true]) test(`A5 kernels generate guarded six-tap ${forceWebGL ? 'GLSL' : 'WGSL'} with no history`, () => {
  const { renderer } = cpuRenderer(forceWebGL);
  const source = texture(new Texture()), emitter = vec2(.6, .2);
  assert.deepEqual(SHAFT_STEPS, [1 / 6, 1 / 36, 1 / 216]);
  for (const step of SHAFT_STEPS) {
    const material = new NodeMaterial(); material.depthTest = false; material.depthWrite = false;
    material.fragmentNode = shaftBlurNode(source, emitter, step);
    const code = build(renderer, material).fragmentShader;
    assert.match(code, /i < 6/);
    assert.match(code, /0\.00001/);
    assert.match(code, /all\(/);
    assert.match(code, /textureLod|textureSampleLevel/);
    assert.match(code, /<=/);
    assert.doesNotMatch(code, /previous|history|frameId/);
    material.dispose();
  }
  const mask = new NodeMaterial(); mask.fragmentNode = shaftMaskNode(source, emitter);
  const code = build(renderer, mask).fragmentShader;
  assert.match(code, /1\.1/); assert.match(code, /0\.12/); assert.match(code, /0\.35/);
  mask.dispose(); source.value.dispose();
});

for (const forceWebGL of [false, true]) test(`shared depth uses current ${forceWebGL ? 'WebGL' : 'WebGPU'} camera matrices and a native texture`, () => {
  const f = fixture(forceWebGL);
  try {
    f.pipeline.setSize(1921, 1081);
    f.pipeline.render();
    assert.equal(f.draws[0].mask, 1);
    assert.equal(f.draws[0].target.samples, 0);
    assert.equal(f.draws[0].target.depthTexture, f.depth.opaqueDepth.value);
    assert.equal(f.draws[0].depthAvailable, 0);
    assert.equal(f.draws.at(-1).depthAvailable, 1);
    assert.deepEqual(f.surfaces.map(draw => draw.object), [f.mesh]);
    assert.equal(f.surfaces[0].material.positionNode, f.mesh.material.positionNode);
    assert.equal(f.surfaces[0].material.depthWrite, true);
    assert.doesNotThrow(() => build(f.renderer, f.surfaces[0].material, f.camera));
    assert.equal(f.depth.nodes.texture.isTextureNode, true);
    assert.equal(f.depth.nodes.texture.value, f.depth.opaqueDepth.value);
    assert.equal(f.camera.coordinateSystem, f.renderer.coordinateSystem);
    assert.deepEqual(f.depth.opaqueProjectionInverse.value.elements, f.camera.projectionMatrixInverse.elements);
    assert.deepEqual(f.depth.opaqueInverseSize.value.toArray(), [1 / 1921, 1 / 1081]);
    const material = new NodeMaterial(); material.fragmentNode = vec4(f.depth.nodes.worldPosition(uv()), 1);
    const code = build(f.renderer, material, f.camera).fragmentShader;
    assert.match(code, /texture/);
    assert.match(code, forceWebGL ? /vec3\(.*2\.0/s : /vec4<f32>/);
    material.dispose();
  } finally { f.pipeline.dispose(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
});

for (const forceWebGL of [false, true]) test(`prepass preserves instanced surface setup on ${forceWebGL ? 'WebGL' : 'WebGPU'}`, () => {
  const f = fixture(forceWebGL), time = { value: 2 };
  const source = new MeshStandardNodeMaterial();
  attachSurface(source, { kind: 'terrain', billow: true, uniforms: { terrainTime: time } });
  const surface = createSurfaceMaterial(source);
  const instances = new InstancedMesh(f.mesh.geometry, surface, 2);
  instances.setMatrixAt(0, new Matrix4().makeTranslation(2, 0, 0));
  instances.setMatrixAt(1, new Matrix4().makeTranslation(-2, 1, 0));
  f.scene.remove(f.mesh); f.scene.add(instances);
  try {
    for (const value of [2, 9]) {
      time.value = value; f.pipeline.render();
      const prepass = f.surfaces.at(-1).material;
      assert.equal(prepass.constructor, surface.constructor);
      assert.equal(prepass.setupPosition, surface.setupPosition);
      assert.equal(prepass.nodeSurface.uniforms.terrainTime, time, 'clone shares live time holder');
      assert.ok(prepass._surfacePosition, 'preserve subclass deformation before instancing');
      const builder = f.renderer.backend.createNodeBuilder(instances, f.renderer);
      builder.material = prepass; builder.camera = f.camera; builder.scene = f.scene;
      builder.build();
      assert.match(builder.vertexShader, /positionLocal/);
      assert.match(builder.vertexShader, /instance/i);
      assert.match(builder.vertexShader, /sin/);
    }
  } finally { f.pipeline.dispose(); surface.dispose(); source.dispose(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
});

test('prepass and render failures restore caller state and invalidate shared depth', () => {
  for (const stage of ['prepass', 'pipeline']) {
    const f = fixture();
    const target = new RenderTarget(32, 32), background = new Color('#123456');
    f.scene.background = background; f.scene.name = 'original';
    f.renderer.setRenderTarget(target, 2, 1); f.renderer.setClearColor(0x123456, .4);
    f.renderer.setViewport(2, 3, 31, 29); f.renderer.setScissor(4, 5, 23, 19); f.renderer.setScissorTest(true);
    f.renderer.autoClear = false; f.renderer.autoClearColor = false; f.renderer.autoClearDepth = false;
    const callback = () => {}; f.renderer.setRenderObjectFunction(callback);
    f.renderer.render = object => {
      if ((stage === 'prepass') === Boolean(object.isScene)) throw new Error(stage);
    };
    try {
      assert.throws(() => f.pipeline.render(), new RegExp(stage));
      assert.equal(f.renderer.getRenderTarget(), target);
      assert.equal(f.renderer.getActiveCubeFace(), 2); assert.equal(f.renderer.getActiveMipmapLevel(), 1);
      assert.equal(f.renderer.getRenderObjectFunction(), callback);
      assert.equal(f.renderer.autoClear, false); assert.equal(f.renderer.autoClearColor, false); assert.equal(f.renderer.autoClearDepth, false);
      assert.equal(f.renderer.toneMapping, AgXToneMapping); assert.equal(f.renderer.outputColorSpace, SRGBColorSpace);
      assert.equal(f.renderer.getClearAlpha(), .4); assert.equal(f.renderer.getScissorTest(), true);
      assert.deepEqual(f.renderer.getViewport(new Vector4()).toArray(), [2, 3, 31, 29]);
      assert.deepEqual(f.renderer.getScissor(new Vector4()).toArray(), [4, 5, 23, 19]);
      assert.equal(f.scene.background, background); assert.equal(f.camera.layers.mask, 3);
      assert.equal(f.depth.opaqueDepthAvailable.value, 0);
    } finally { f.pipeline.dispose(); target.dispose(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
  }
});

test('lower tiers skip the prepass and dispose clears only owned depth', () => {
  const f = fixture();
  try {
    f.pipeline.render();
    const target = f.draws[0].target;
    let disposals = 0; target.addEventListener('dispose', () => disposals++);
    f.pipeline.setQuality({name: 'BALANCED', ao: false, bloom: true, film: true});
    assert.equal(f.depth.opaqueDepthAvailable.value, 0);
    f.draws.length = 0; f.pipeline.render();
    assert.equal(f.draws.length, 1); assert.equal(f.draws[0].object.isQuadMesh, true);
    f.pipeline.dispose(); f.pipeline.dispose();
    assert.equal(disposals, 1); assert.equal(f.depth.opaqueDepth.value, null); assert.equal(f.depth.nodes, undefined);
    f.draws.length = 0; f.pipeline.render(); assert.equal(f.draws.length, 0);
  } finally { f.pipeline.dispose(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
});

for (const forceWebGL of [false, true]) test(`complete native graph builds on the CPU for ${forceWebGL ? 'forceWebGL' : 'WebGPU'}`, () => {
  const f = fixture(forceWebGL);
  try {
    f.pipeline.setQuality({name: 'ULTRA', ao: true, aoScale: .7, bloom: true, film: true});
    f.pipeline.update(16, {...defaultGrade, ssr: true}, new Vector3(.4, .7, .9), .2);
    f.pipeline.render();
    const final = f.draws.at(-1).object;
    const queue = [final.material], visited = new Set(), nodes = new Set(), codes = [];
    while (queue.length) {
      const material = queue.shift();
      if (!material || visited.has(material)) continue;
      visited.add(material);
      const builder = build(f.renderer, material, f.camera); codes.push(builder.fragmentShader);
      for (const node of builder.nodes) {
        nodes.add(node);
        // Bloom binds these per draw in updateBefore(); no draw runs in this test.
        for (const blur of node._separableBlurMaterials || []) blur.colorTexture.value = node._renderTargetBright.texture;
        queue.push(node._quadMesh?.material, node._material, node._ssrMaterial, node._blurMaterial, node._copyMaterial,
          node._highPassFilterMaterial, node._compositeMaterial, ...(node._separableBlurMaterials || []));
      }
    }
    const rtts = [...nodes].filter(node => node.isRTTNode);
    const shaftTargets = rtts.filter(node => node.name.startsWith('Cinema_shaft') && node.name !== 'Cinema_shaftCombine');
    assert.equal(shaftTargets.length, 4);
    for (const node of shaftTargets) {
      assert.equal(node.renderTarget.width, 481); assert.equal(node.renderTarget.height, 271);
      assert.equal(node.renderTarget.depthBuffer, false);
    }
    assert.equal([...nodes].some(node => node.constructor.name === 'GTAONode' && node.useTemporalFiltering === false), true);
    assert.equal([...nodes].some(node => node.constructor.name === 'SSRNode' && node.stochastic === false), true);
    assert.equal([...nodes].some(node => node.constructor.name === 'FXAANode'), true);
    assert.equal([...nodes].some(node => node.isRenderOutputNode && node.outputColorSpace === SRGBColorSpace), true);
    const aa = [...nodes].find(node => node.constructor.name === 'FXAANode');
    assert.equal(aa.textureNode.name, 'Cinema_output', 'FXAA must consume display-referred color');
    const uniforms = Object.fromEntries([...nodes].filter(node => node.isUniformNode && node.name?.startsWith('cinema_')).map(node => [node.name, node]));
    assert.equal(uniforms.cinema_frame.value, 384);
    assert.equal(uniforms.cinema_strength.value, .2);
    assert.ok(Math.abs(uniforms.cinema_emitter.value.y - .3) < 1e-12, 'convert the caller bottom-left shaft UV once');
    f.pipeline.update(8, {...defaultGrade, ssr: true}, new Vector3(.4, .7, .9), .2);
    assert.equal(uniforms.cinema_frame.value, 192);
    f.pipeline.update(16, {...defaultGrade, ssr: true}, new Vector3(.4, .7, .9), .2);
    assert.equal(uniforms.cinema_frame.value, 384);
    assert.ok(codes.length > 8, 'build intermediate materials as well as the final film pass');
    assert.match(codes[0], /mix\(\s*vec3(?:<f32>)?\(\s*dot\(/,
      'film mixes grayscale toward color, with saturation as the factor');
    const targets = new Set([...nodes].map(node => node.renderTarget).filter(Boolean));
    const disposals = new Map([...targets].map(target => [target, 0]));
    for (const target of targets) target.addEventListener('dispose', () => disposals.set(target, disposals.get(target) + 1));
    f.pipeline.setQuality({name: 'LITE', ao: false, bloom: false, film: false});
    for (const count of disposals.values()) assert.equal(count, 1, 'rebuilding the graph releases old pass targets');
    f.draws.length = 0; f.pipeline.render();
    const lite = build(f.renderer, f.draws.at(-1).object.material, f.camera);
    assert.equal([...lite.nodes].some(node => ['GTAONode', 'SSRNode', 'BloomNode', 'FXAANode'].includes(node.constructor.name)), false);
    f.pipeline.dispose();
    for (const count of disposals.values()) assert.equal(count, 1, 'old targets are not retained for a second disposal');
  } finally { f.pipeline.dispose(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
});

for (const forceWebGL of [false, true]) test(`default grade and SSR transitions retain equivalent graphs on ${forceWebGL ? 'WebGL' : 'WebGPU'}`, () => {
  const f = fixture(forceWebGL);
  const inspect = () => {
    f.pipeline.render();
    const material = f.draws.at(-1).object.material;
    const queue = [material], visited = new Set(), nodes = new Set();
    while (queue.length) {
      const next = queue.shift();
      if (!next || visited.has(next)) continue;
      visited.add(next);
      for (const node of build(f.renderer, next, f.camera).nodes) {
        nodes.add(node);
        queue.push(node._quadMesh?.material, node._material, node._ssrMaterial, node._highPassFilterMaterial, node._compositeMaterial);
      }
    }
    return {material, nodes:[...nodes], uniforms:Object.fromEntries([...nodes]
      .filter(node => node.isUniformNode && node.name?.startsWith('cinema_'))
      .map(node => [node.name.slice(7), node]))};
  };
  try {
    const initial = inspect();
    for (const key of ['exposure','saturation','grain','aberration','bloomStrength','bloomRadius','bloomThreshold']) {
      assert.equal(initial.uniforms[key].value, defaultGrade[key]);
    }
    assert.deepEqual(initial.uniforms.tint.value.toArray(), defaultGrade.tint);
    assert.equal(initial.nodes.some(n => n.constructor.name === 'SSRNode'), false);
    f.pipeline.update(0, {});
    assert.equal(inspect().material, initial.material, 'partial default grade does not rebuild');
    f.pipeline.update(7, {exposure:2, tint:[.8,.9,1], ssr:true});
    const reflected = inspect();
    assert.equal(reflected.nodes.filter(n => n.constructor.name === 'SSRNode').length, 1);
    assert.equal(reflected.uniforms.exposure.value, 2);
    assert.equal(reflected.uniforms.grain.value, defaultGrade.grain);
    const ssrNode = reflected.nodes.find(n => n.constructor.name === 'SSRNode');
    let disposed = 0; ssrNode.addEventListener('dispose', () => disposed++);
    f.pipeline.update(8, {exposure:1.8, ssr:true});
    assert.equal(inspect().material, reflected.material, 'uniform-only grade edits retain graph');
    assert.deepEqual(reflected.uniforms.tint.value.toArray(), defaultGrade.tint, 'omitted grade fields reset');
    f.pipeline.update(7, {});
    const restored = inspect();
    assert.equal(disposed, 1, 'turning SSR off releases its pass');
    assert.equal(restored.nodes.some(n => n.constructor.name === 'SSRNode'), false);
    assert.equal(restored.uniforms.exposure.value, defaultGrade.exposure);
    f.pipeline.setQuality({name:'BALANCED',ao:false,bloom:true,film:true});
    f.pipeline.update(7,{ssr:true});
    assert.equal(inspect().nodes.some(n => ['SSRNode','GTAONode'].includes(n.constructor.name)),false);
    f.pipeline.setQuality({name:'HIGH',ao:true,bloom:true,film:true});
    assert.equal(inspect().nodes.some(n => n.constructor.name === 'SSRNode'),true,'restoring quality honors the current scene SSR flag');
  } finally { f.pipeline.dispose(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
});

// Isolated, opt-in real-device smoke. Never uses the shared application build.
test('native and forceWebGL pipeline pixels, flags, resize and disposal', { skip: !process.env.NODE_PIPELINE_GPU, timeout: 240000 }, async () => {
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { chromium } = await import('@playwright/test');
  const root = new URL('../', import.meta.url);
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
      res.setHeader('content-type', req.url === '/' ? 'text/html' : 'text/javascript');
      res.end(req.url === '/' ? '<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/webgpu":"/node_modules/three/build/three.webgpu.js","three/tsl":"/node_modules/three/build/three.tsl.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>' : await readFile(new URL(`.${req.url}`, root)));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
    for (const forceWebGL of [false, true]) {
      const page = await browser.newPage(), errors = [], warnings = [];
      await page.addInitScript(() => {
        const warn = console.warn.bind(console);
        console.warn = (...args) => warn(...args, new Error('warning origin').stack);
      });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log(m.text().slice(0,1200)); } if (m.type() === 'warning') { warnings.push(m.text()); console.log(m.text().slice(0,2000)); } });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async forceWebGL => {
        const T = await import('three/webgpu');
        const { createNodePipeline, fogAwareAO } = await import('/dist/node-pipeline.js');
        const { opaqueDepthUniforms } = await import('/dist/render-kit.js');
        const canvas = document.createElement('canvas'); document.body.append(canvas);
        const renderer = new T.WebGPURenderer({ canvas, forceWebGL });
        const checks = [], gpuErrors = [], targets = new Map(), draws = [];
        const check = (value, message) => { if (!value) throw new Error(message); checks.push(message); };
        let pipeline, output;
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(50, 320 / 240, .1, 100);
        scene.background = new T.Color(.015, .025, .045);
        camera.position.set(0, 3, 8); camera.lookAt(0, 1, 0); camera.layers.enable(1);
        const geometry = new T.BoxGeometry(), materials = [];
        const box = (color, x, y, z, sx, sy, sz, emission = 0) => {
          const material = new T.MeshStandardNodeMaterial({ color, roughness: .32, metalness: .3, emissive: color, emissiveIntensity: emission }); materials.push(material);
          const mesh = new T.Mesh(geometry, material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); scene.add(mesh); return mesh;
        };
        const floor = box(0x8899aa,0,-.15,0,12,.3,12); floor.userData.ssrReceiver = true;
        box(0xdd3322,-1,.8,0,1.4,1.6,1.4);
        box(0x2244cc,.7,.5,2,1,1,1);
        const lamp = box(0xffddaa,1.1,2.3,-1,.7,.7,.7,18);
        const effect = box(0x22ff88,-.8,1.5,1,1.2,1.2,.1,3); effect.layers.set(1);
        effect.material.transparent = true; effect.material.opacity = .4; effect.material.depthWrite = false;
        scene.add(new T.HemisphereLight(0xffffff,0x444466,2));
        const light = new T.DirectionalLight(0xffffff,3); light.position.set(2,5,4); scene.add(light);
        try {
          await renderer.init(); renderer.setSize(320,240); renderer.setPixelRatio(1);
          check(Boolean(renderer.backend.isWebGPUBackend) === !forceWebGL, 'requested backend active');
          renderer.backend.device?.addEventListener('uncapturederror', e => gpuErrors.push(e.error.message));
          // Compare output against the actual classic OutputPass + film shader,
          // not against native intermediates that can share the same mistake.
          const C = await import('three'), tsl = await import('three/tsl');
          const {EffectComposer} = await import('three/addons/postprocessing/EffectComposer.js');
          const {RenderPass} = await import('three/addons/postprocessing/RenderPass.js');
          const {OutputPass} = await import('three/addons/postprocessing/OutputPass.js');
          const {ShaderPass} = await import('three/addons/postprocessing/ShaderPass.js');
          const {filmShader, applyFilmGrade} = await import('/dist/cinema.js');
          const classic = new C.WebGLRenderer(); classic.setSize(64,64);
          classic.toneMapping=C.AgXToneMapping; classic.toneMappingExposure=1.6;
          const flatScene=new C.Scene(), flatCamera=new C.OrthographicCamera(-1,1,1,-1,.1,10);
          flatCamera.position.z=2;
          const flatGeometry=new C.PlaneGeometry(2,2), rgb=tsl.uniform(new T.Vector3());
          const nativeFlat=new T.NodeMaterial(); nativeFlat.fragmentNode=tsl.vec4(rgb,1);
          const classicFlat=new C.ShaderMaterial({uniforms:{rgb:{value:new C.Vector3()}},
            vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader:'uniform vec3 rgb;void main(){gl_FragColor=vec4(rgb,1.);}'});
          const flatMesh=new C.Mesh(flatGeometry,nativeFlat); flatScene.add(flatMesh);
          const classicPipeline=new EffectComposer(classic), classicFilm=new ShaderPass(filmShader);
          classicPipeline.addPass(new RenderPass(flatScene,flatCamera));
          classicPipeline.addPass(new OutputPass()); classicPipeline.addPass(classicFilm); classicPipeline.renderToScreen=false;
          renderer.setSize(64,64);
          const flatTarget=new T.RenderTarget(64,64,{depthBuffer:false});renderer.setRenderTarget(flatTarget);
          const nativePipeline=createNodePipeline({renderer,scene:flatScene,camera:flatCamera,canvas});
          nativePipeline.setQuality({name:'HIGH',ao:false,bloom:false,film:true});
          try {
            for(const saturation of [0,.94,1]) for(const color of [[.001,.001,.001],[.018,.018,.018],[.18,.18,.18],[.5,.5,.5],[1,1,1],[4,4,4],[16,16,16],[.8,.12,.025]]) {
              const grade={...((await import('/dist/scene-config.js')).defaultGrade),saturation,grain:0,aberration:0};
              await new Promise(requestAnimationFrame);
              rgb.value.fromArray(color);classicFlat.uniforms.rgb.value.fromArray(color);
              nativePipeline.update(0,grade);flatMesh.material=nativeFlat;nativePipeline.render();
              const actual=await renderer.readRenderTargetPixelsAsync(flatTarget,32,32,1,1);
              flatMesh.material=classicFlat;applyFilmGrade(classicFilm.uniforms,0,grade);classicPipeline.render();
              const expected=new Uint16Array(4);classic.readRenderTargetPixels(classicPipeline.readBuffer,32,32,1,1,expected);
              check([0,1,2,3].every(i=>Math.abs(actual[i]-Math.round(C.DataUtils.fromHalfFloat(expected[i])*255))<=1),`classic color parity ${color} saturation ${saturation}`);
            }
            const fog={mode:tsl.uniform(0),density:tsl.uniform(0),near:tsl.uniform(10),far:tsl.uniform(90)};
            const fogMaterial=new T.NodeMaterial();fogMaterial.fragmentNode=tsl.vec4(tsl.vec3(fogAwareAO(tsl.float(.25),tsl.float(100),fog)),1);
            const fogQuad=new T.QuadMesh(fogMaterial);
            renderer.toneMapping=T.NoToneMapping;renderer.outputColorSpace=T.LinearSRGBColorSpace;
            try {
              for(const [mode,density,expected] of [[0,0,.25],[1,0,.25],[1,.01,1-.75*Math.exp(-1)],[1,.1,1],[2,0,1]]) {
                fog.mode.value=mode;fog.density.value=density;await new Promise(requestAnimationFrame);fogQuad.render(renderer);
                const actual=await renderer.readRenderTargetPixelsAsync(flatTarget,32,32,1,1);
                check(Math.abs(actual[0]-Math.round(expected*255))<=1,`AO fog visibility mode ${mode} density ${density}`);
              }
            } finally {fogMaterial.dispose();}
          } finally {
            nativePipeline.dispose();classicPipeline.dispose();classicFlat.dispose();nativeFlat.dispose();flatGeometry.dispose();flatTarget.dispose();classic.dispose();
            renderer.setRenderTarget(null);renderer.setSize(320,240);
          }
          output = new T.RenderTarget(320,240,{ depthBuffer:false }); renderer.setRenderTarget(output);
          const originalRender = renderer.render.bind(renderer);
          renderer.render = (object, camera) => {
            const target = renderer.getRenderTarget();
            if (target && target !== output && !targets.has(target)) {
              const record = { disposals:0 }; targets.set(target, record);
              target.addEventListener('dispose', () => record.disposals++);
            }
            draws.push({ name:object.name, target:target?.texture.name, width:target?.width, height:target?.height });
            return originalRender(object,camera);
          };
          const depth = opaqueDepthUniforms(canvas);
          pipeline = createNodePipeline({ renderer,scene,camera,canvas,depth });
          const quality = ao => pipeline.setQuality({name:'HIGH',ao,aoScale:1,bloom:true,film:true});
          const projected = lamp.position.clone().project(camera);
          const emitter = new T.Vector2(projected.x*.5+.5,projected.y*.5+.5);
          const frame = async (time,{ao=true,ssr=false,shaft=0,grain=0} = {}) => {
            quality(ao); draws.length=0;
            pipeline.update(time,{ssr,grain},emitter,shaft); pipeline.render();
            const bytes = await renderer.readRenderTargetPixelsAsync(output,0,0,output.width,output.height);
            if (renderer.backend.gl) check(renderer.backend.gl.getError() === 0, 'no WebGL draw feedback/error');
            // WebGPU readback retains 256-byte row alignment, except the last row.
            const stride = forceWebGL ? output.width * 4 : Math.ceil(output.width * 4 / 256) * 256;
            return Array.from({length:output.height}, (_,y)=>Array.from(bytes.subarray(y*stride,y*stride+output.width*4))).flat();
          };
          const diff = (a,b) => a.reduce((n,v,i)=>n+(v!==b[i]),0);
          const base = await frame(16);
          check(Math.max(...base.slice(0,20000))>30 && new Set(base).size>80,`nonblank graded output (${new Set(base).size} values, max ${Math.max(...base.slice(0,20000))})`);
          check(depth.opaqueDepthAvailable.value===1,'opaque depth available');
          effect.visible=false; const hidden = await frame(16); effect.visible=true;
          check(diff(base,hidden)>100,'effect contributes to HDR output');
          const noAO = await frame(16,{ao:false}); check(diff(base,noAO)>20,'AO flag changes pixels');
          check(depth.opaqueDepthAvailable.value===0,'disabled AO invalidates depth');
          const shaft = await frame(16,{shaft:1}); check(diff(base,shaft)>20,'shaft flag changes pixels');
          check(draws.filter(d=>d.name?.startsWith('Cinema_shaft')&&d.name!=='Cinema_shaftCombine [RTT]').some(d=>d.width===80&&d.height===60),'quarter resolution shafts');
          const reflected = await frame(16,{ssr:true}); check(diff(base,reflected)>20,'SSR flag changes receiver pixels');
          const forward = await frame(16,{ssr:true,shaft:.5,grain:.025});
          const backward = await frame(8,{ssr:true,shaft:.5,grain:.025});
          const repeat = await frame(16,{ssr:true,shaft:.5,grain:.025});
          check(diff(forward,backward)>100,'time changes film pixels');
          check(diff(forward,repeat)===0,'reverse frame pixels exact');
          renderer.setSize(257,193); output.setSize(257,193); camera.aspect=257/193; camera.updateProjectionMatrix(); pipeline.setSize(257,193);
          const resized = await frame(16,{ssr:true,shaft:.5});
          check(resized.length===257*193*4 && depth.opaqueInverseSize.value.x===1/257,`physical resize (${resized.length}, ${depth.opaqueInverseSize.value.x})`);
          check(draws.some(d=>d.name?.startsWith('Cinema_shaft')&&d.width===65&&d.height===49),'resized quarter targets');
          // Compare the native subclass itself against its prepass clone. The
          // same instanced billow must produce identical normals AND depth.
          const { attachSurface, createSurfaceMaterial } = await import('/dist/node-surfaces.js');
          const N = await import('three/tsl');
          const time = { value:2 }, original = new T.MeshStandardNodeMaterial();
          attachSurface(original,{kind:'terrain',billow:true,uniforms:{terrainTime:time}});
          const surface = createSurfaceMaterial(original), sphere = new T.SphereGeometry(.8,20,12);
          const instanced = new T.InstancedMesh(sphere,surface,2);
          instanced.setMatrixAt(0,new T.Matrix4().makeTranslation(-1,1,0));
          instanced.setMatrixAt(1,new T.Matrix4().makeTranslation(1,1,-1));
          scene.clear(); scene.background=null; scene.add(instanced);
          renderer.setSize(320,240); output.setSize(320,240); camera.aspect=320/240; camera.updateProjectionMatrix(); pipeline.setSize(320,240);
          const reference = new T.RenderTarget(320,240,{type:T.HalfFloatType});
          reference.depthTexture = new T.DepthTexture(320,240,T.FloatType);
          reference.depthTexture.isRenderTargetTexture = true;
          const depthMaterial = new T.NodeMaterial(), quad = new T.QuadMesh(depthMaterial);
          depthMaterial.depthTest=false; depthMaterial.depthWrite=false;
          const read = target => renderer.readRenderTargetPixelsAsync(target,0,0,320,240);
          const depthPixels = async target => {
            depthMaterial.fragmentNode=N.vec4(N.texture(target.depthTexture).mul(20).fract(),0,0,1);
            depthMaterial.needsUpdate=true; renderer.setRenderTarget(output); quad.render(renderer);
            return Array.from(await read(output));
          };
          let previousNormals;
          try {
            for (const value of [2,9]) {
              time.value=value; await frame(value);
              const prepass = [...targets.keys()].find(target=>target.texture.name==='Cinema_opaqueNormalsAndSSRMask');
              const normals = Array.from(await read(prepass));
              const actualDepth = await depthPixels(prepass);
              surface.outputNode=N.vec4(N.normalView,0); surface.lights=false;
              surface.toneMapped=false; surface.fog=false; surface.blending=T.NoBlending; surface.needsUpdate=true;
              renderer.toneMapping=T.NoToneMapping; renderer.outputColorSpace=T.LinearSRGBColorSpace;
              renderer.setClearColor(0,0); renderer.setRenderTarget(reference);
              // Bypass instrumentation: this reference target is owned by the test.
              originalRender(scene,camera);
              check(diff(normals,Array.from(await read(reference)))===0,`billow normals agree at ${value}`);
              check(diff(actualDepth,await depthPixels(reference))===0,`billow depth agrees at ${value}`);
              if (previousNormals) check(diff(previousNormals,normals)>100,'billow changes coverage across time');
              previousNormals=normals;
              renderer.setRenderTarget(output);
            }
          } finally { reference.dispose(); depthMaterial.dispose(); sphere.dispose(); surface.dispose(); original.dispose(); }
          pipeline.dispose(); pipeline.dispose();
          check([...targets.values()].every(record=>record.disposals>=1),'all rendered graph targets disposed');
          check(depth.nodes===undefined&&depth.opaqueDepth.value===null,'shared depth released');
          await renderer.backend.device?.queue.onSubmittedWorkDone();
          check(gpuErrors.length===0, `no GPU validation errors: ${gpuErrors.join('; ')}`);
          return {backend:forceWebGL?'forceWebGL':'WebGPU',checks:checks.length,targets:targets.size,aoPixels:diff(base,noAO),shaftPixels:diff(base,shaft),ssrPixels:diff(base,reflected)};
        } finally {
          pipeline?.dispose(); output?.dispose(); geometry.dispose(); for (const material of materials) material.dispose(); renderer.dispose(); canvas.remove();
        }
      }, forceWebGL);
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, []);
      console.log(JSON.stringify(result));
      await page.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
