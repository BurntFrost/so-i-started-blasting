import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { markEffect, markEffects, opaqueDepthUniforms, volumeUniforms, marchedVolume } from '../dist/render-kit.js';
import { OpaqueGTAOPass } from '../dist/ao-pass.js';
import { qualityTiers } from '../dist/cinema.js';
import { createTerrestrial } from '../dist/terrestrial.js';
import { createCosmic } from '../dist/cosmic.js';
import { scenes } from '../dist/scenes.js';

test('effect classification handles descendants and material arrays without moving opaque structures', () => {
  const group = new THREE.Group(), opaque = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const effect = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({transparent:true})]);
  effect.castShadow = true; group.add(opaque, effect); markEffects(group);
  assert.equal(effect.layers.mask, 2); assert.equal(effect.castShadow, false); assert.equal(opaque.layers.mask, 1);
  markEffect(group); assert.equal(opaque.layers.mask, 2);
});

test('tiers, per-canvas uniform isolation and native colour UV sizing', () => {
  assert.deepEqual(qualityTiers.map(t => t.ao), [false,false,true,true]);
  assert.deepEqual(qualityTiers.map(t => t.aoScale), [1,1,1,.7]);
  const canvas = {}, depth = opaqueDepthUniforms(canvas);
  assert.equal(opaqueDepthUniforms(canvas), depth); assert.notEqual(opaqueDepthUniforms({}), depth);
  const pass = new OpaqueGTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), depth);
  pass.resolutionScale=.7;pass.setSize(1000,600);
  assert.equal(pass.normalRenderTarget.width,700);assert.equal(pass.height,420);
  assert.deepEqual(depth.opaqueInverseSize.value.toArray(), [.001,1/600]);
  assert.equal(pass._renderGBuffer,false);pass.dispose();
});

test('GTAO noise is reproducible across fresh pass instances', () => {
  const a=new OpaqueGTAOPass(new THREE.Scene(),new THREE.PerspectiveCamera(),opaqueDepthUniforms({}));
  const b=new OpaqueGTAOPass(new THREE.Scene(),new THREE.PerspectiveCamera(),opaqueDepthUniforms({}));
  assert.deepEqual(a.pdNoiseTexture.image.data,b.pdNoiseTexture.image.data);
  assert.deepEqual(a.gtaoNoiseTexture.image.data,b.gtaoNoiseTexture.image.data);
  assert.equal(a.gtaoMaterial.uniforms.radius.value,6);assert.equal(a.blendIntensity,1);
  a.dispose();b.dispose();
});

for (const fail of [false,true]) test(`prepass runs once and restores render state${fail?' on failure':''}`, () => {
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(), points=new THREE.Points();scene.add(points);
  camera.layers.enable(1);camera.position.set(3,4,5);const override=new THREE.MeshBasicMaterial();scene.overrideMaterial=override;
  const depth=opaqueDepthUniforms({}),pass=new OpaqueGTAOPass(scene,camera,depth), originalTarget={};let target=originalTarget,color=new THREE.Color('red'),alpha=.4,renders=0;
  const renderer={autoClear:true,shadowMap:{autoUpdate:true,needsUpdate:true},getRenderTarget:()=>target,getActiveCubeFace:()=>2,getActiveMipmapLevel:()=>3,getClearColor:c=>c.copy(color),getClearAlpha:()=>alpha,
    setRenderTarget:t=>{target=t;},setClearColor:(c,a)=>{color.set(c);if(a!==undefined)alpha=a;},clear:()=>{},render:()=>{
      renders++;assert.equal(camera.layers.mask,1);assert.equal(points.visible,false);assert.equal(scene.overrideMaterial,pass.normalMaterial);
      assert.equal(renderer.shadowMap.autoUpdate,false);assert.equal(renderer.shadowMap.needsUpdate,false);assert.equal(target,pass.normalRenderTarget);
      assert.deepEqual(depth.opaqueCameraWorld.value.elements,camera.matrixWorld.elements);
      if(fail)throw new Error('render failed');
    }};
  if(fail)assert.throws(()=>pass.prepass(renderer),/render failed/);else pass.prepass(renderer);
  assert.equal(renders,1);assert.equal(depth.opaqueDepthAvailable.value,fail?0:1);
  assert.equal(camera.layers.mask,3);assert.equal(points.visible,true);assert.equal(scene.overrideMaterial,override);assert.equal(target,originalTarget);
  assert.equal(renderer.autoClear,true);assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.shadowMap.needsUpdate,true);assert.equal(color.getHex(),0xff0000);assert.equal(alpha,.4);pass.dispose();
});

test('volume depth clamps both inside and outside rays before marching, with an availability guard', () => {
  const mesh=marchedVolume({name:'test',geometry:new THREE.BoxGeometry(),uniforms:volumeUniforms({},{}),field:'vec3 field(vec3 p,bool detail){return vec3(1.);}',span:'10.',dt:'.1,1.',loop:32,shade:'sampleColor=vec3(1.);',absorb:'1.'});
  const shader=mesh.material.fragmentShader;
  assert.match(shader,/start=inside>\.5\?cameraPosition:hullPoint/);
  assert.match(shader,/if\(opaqueDepthAvailable>\.5\)\{[\s\S]*texture2D\(opaqueDepth,uv\)/);
  assert.match(shader,/span=min\(span,dot\(opaqueWorldPoint\(uv,depth\)-start,rayDir\)\)/);
  assert.ok(shader.indexOf('if(span<=0.)discard')<shader.indexOf('for(int i='));assert.equal(mesh.layers.mask,2);
});

test('every lazy scene factory classifies its effects and preserves opaque meshes', async () => {
  const original=THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
  try {
    const volumeOnly=new Set(['deep-impact']);
    const scene=new THREE.Scene(),canvas={dataset:{quality:'high',qualityCeiling:'high'},dispatchEvent:()=>{}},camera=new THREE.PerspectiveCamera(),landscape=new THREE.Group();
    const terrestrial=createTerrestrial({scene,canvas,camera,landscape}),cosmic=createCosmic({scene,canvas,camera});
    for(const config of scenes){
      terrestrial.update(16,config);cosmic.update(16,config);await Promise.resolve();
      let opaque=0;
      scene.traverse(object=>{
        const materials=[].concat(object.material||[]);
        if(object.isPoints||object.isSprite||materials.some(m=>m.transparent||m.blending===THREE.AdditiveBlending)){
          assert.equal(object.layers.mask,2,`${config.id}: ${object.name||object.type}`);assert.equal(object.castShadow,false);
        } else if(object.isMesh){opaque++;assert.equal(object.layers.mask,1,`${config.id}: opaque ${object.name}`);}
      });
      // Deep Impact's factory is three marched volumes over the shared city; its opaque geometry is simulation-owned.
      if(config.renderer!=='original'&&!volumeOnly.has(config.id))assert.ok(opaque>0,config.id);
    }
  } finally {THREE.TextureLoader.prototype.loadAsync=original;}
});

test('surfaces flagged opaqueDepth keep layer 0 and their shadow flag despite alpha', () => {
  const group=new THREE.Group();
  const water=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial({transparent:true,opacity:.95}));
  water.userData.opaqueDepth=true;water.castShadow=true;
  const mist=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({transparent:true}));
  group.add(water,mist);markEffects(group);
  assert.equal(water.layers.mask,1);assert.equal(water.castShadow,true);assert.equal(mist.layers.mask,2);
});
