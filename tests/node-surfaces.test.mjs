import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';

// The offline builders are source modules. Resolve TSL/materials from that SAME
// graph so builder stack state is not split between source and bundled copies.
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'three/webgpu') return next('three/src/Three.WebGPU.js', context);
  if (specifier === 'three/tsl') return next('three/src/Three.TSL.js', context);
  return next(specifier, context);
}});
const THREE = await import('three/webgpu');
const { lights } = await import('three/tsl');
const { default: WGSLNodeBuilder } = await import('three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js');
const { default: GLSLNodeBuilder } = await import('three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js');
const { attachSurface, createSurfaceMaterial, surfaceKinds } = await import('../dist/node-surfaces.js');

function uniforms() {
  return {facadeGrid:{value:new THREE.Vector2(8,20)},facadeSeed:{value:9},waterTime:{value:12},
    fieldPlots:{value:1},terrainTime:{value:16},funnelShape:{value:new THREE.Vector4(4,60,100,1.7)},
    funnelLean:{value:new THREE.Vector2(7,-2)},funnelTime:{value:16},ashFall:{value:.5}};
}

test('attachment preserves legacy behavior and original uniform holders; conversion creates native PBR', () => {
  const source = new THREE.MeshStandardMaterial({color:'#697887',roughness:.4,metalness:.2,opacity:.65,transparent:true});
  let calls = 0; source.onBeforeCompile = () => { calls++; };
  source.customProgramCacheKey = () => 'old';
  const originalPatch = source.onBeforeCompile, u = uniforms(), map = new THREE.Texture();source.map=map;
  assert.equal(attachSurface(source,{kind:'wave',uniforms:u}),source);
  assert.equal(source.onBeforeCompile,originalPatch);assert.equal(source.customProgramCacheKey(),'old');
  const result=createSurfaceMaterial(source);
  assert.ok(result.isMeshStandardNodeMaterial);assert.equal(calls,0);assert.notEqual(result.onBeforeCompile,originalPatch);
  assert.equal(result.nodeSurface.uniforms,u);assert.equal(result.surfaceUniformNodes.waterTime.object,u.waterTime);
  assert.equal(result.map,map);assert.equal(result.roughness,.4);assert.equal(result.metalness,.2);assert.equal(result.opacity,.65);
  assert.equal(result.color.getHex(),source.color.getHex());assert.ok(result.normalNode && result.roughnessNode && result.emissiveNode);
});

test('uniform scalar replacement and vector mutation remain live, including a cloned node material', () => {
  const u=uniforms(), material=createSurfaceMaterial(attachSurface(new THREE.MeshStandardMaterial(),{kind:'funnel',uniforms:u}));
  const clone=material.clone();
  assert.equal(clone.nodeSurface.uniforms,u);
  for (const m of [material,clone]) {
    const time=m.surfaceUniformNodes.funnelTime, shape=m.surfaceUniformNodes.funnelShape;
    time.update();assert.equal(time.node.value,16);
    u.funnelTime.value=3;time.update();assert.equal(time.node.value,3);
    u.funnelShape.value.x=12;shape.update();assert.equal(shape.node.value.x,12);
    u.funnelShape.value=new THREE.Vector4(2,30,80,2);shape.update();assert.equal(shape.node.value,u.funnelShape.value);
    u.funnelTime.value=16;
  }
});

test('facade descriptor can be explicitly reused after a legacy clone', () => {
  const source=attachSurface(new THREE.MeshStandardMaterial(),{kind:'facade',uniforms:uniforms()});
  const clone=source.clone();assert.equal(clone.nodeSurface,undefined);
  attachSurface(clone,source.nodeSurface);const result=createSurfaceMaterial(clone);
  assert.equal(result.surfaceUniformNodes.facadeSeed.object,source.nodeSurface.uniforms.facadeSeed);
});

test('surface kind and billow mode participate in program cache identity', () => {
  const make=(kind,billow=false)=>createSurfaceMaterial(attachSurface(new THREE.MeshStandardMaterial(),{kind,uniforms:uniforms(),billow}));
  assert.notEqual(make('lawn').customProgramCacheKey(),make('mountain').customProgramCacheKey());
  assert.notEqual(make('terrain').customProgramCacheKey(),make('terrain',true).customProgramCacheKey());
});

test('unregistered and incomplete descriptors fail at the attachment boundary', () => {
  assert.throws(()=>attachSurface(new THREE.MeshStandardMaterial(),{kind:'missing'}),/Unknown surface/);
  assert.throws(()=>attachSurface(new THREE.MeshStandardMaterial(),{kind:'funnel',uniforms:{}}),/funnelShape/);
  assert.throws(()=>createSurfaceMaterial(new THREE.MeshStandardMaterial()),/attachSurface/);
});

function buildSurface(kind, billow, Builder) {
  // No device init, browser, GPU work or files: only r186's native code generators.
  const renderer=new THREE.WebGPURenderer({canvas:{width:64,height:64,style:{},addEventListener(){},setAttribute(){}}});
  renderer.hasFeature=()=>false;
  renderer.backend.capabilities.getUniformBufferLimit=()=>65536;
  renderer.backend.extensions={has:()=>false,get:()=>null};
  const source=new THREE.MeshStandardMaterial({vertexColors:true,transparent:true,side:THREE.DoubleSide});
  const material=createSurfaceMaterial(attachSurface(source,{kind,uniforms:uniforms(),billow}));
  const geometry=new THREE.BoxGeometry();
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(.5),3));
  const mesh=new THREE.InstancedMesh(geometry,material,1);mesh.setColorAt(0,new THREE.Color(.6,.7,.8));
  const builder=new Builder(mesh,renderer);builder.camera=new THREE.PerspectiveCamera();builder.scene=new THREE.Scene();
  builder.lightsNode=lights([new THREE.DirectionalLight(),new THREE.AmbientLight()]);
  builder.build();
  return {builder,material};
}

for (const Builder of [WGSLNodeBuilder,GLSLNodeBuilder]) {
  for (const kind of surfaceKinds) for (const billow of kind === 'terrain' ? [false,true] : [false]) {
    test(`${Builder.name} generates ${kind}${billow?' with billow':''} including vertex and instance colors`, () => {
      const {builder,material}=buildSurface(kind,billow,Builder);
      assert.ok(builder.fragmentShader.length>1000);assert.ok(builder.vertexShader.length>1000);
      assert.doesNotMatch(builder.fragmentShader,/\b(?:undefined|NaN)\b/);
      assert.doesNotMatch(builder.vertexShader,/\b(?:undefined|NaN)\b/);
      if (!['facade','mountain'].includes(kind)) assert.match(builder.fragmentShader,/43758\.5453/);
      if (kind==='funnel'||billow) {
        assert.ok(material._surfacePosition);assert.equal(material.positionNode,null);assert.match(builder.vertexShader,/43758\.5453/);
        const assignments=[...builder.vertexShader.matchAll(/positionLocal = ([^\n]+)/g)];
        assert.ok(assignments.length>=3);
        assert.match(assignments[2][1],/positionLocal/, 'instance transform consumes the deformed local position');
        assert.ok(!assignments[1][1].includes('positionLocal'), 'deformation starts from original geometry');
      }
      if (kind==='mountain') {
        const code=builder.fragmentShader;
        assert.ok(code.indexOf('DiffuseColor')<code.lastIndexOf('0.34'), 'ash assignment follows base diffuse color');
      }
    });
  }
}

test('surface module contains no runtime shader strings, callbacks or elapsed-time state', async () => {
  const source=await readFile(new URL('../dist/node-surfaces.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/glslFn|wgslFn|\.onBeforeCompile\s*=|fragmentShader\s*:|vertexShader\s*:|Math\.random|Date\.now/);
});
