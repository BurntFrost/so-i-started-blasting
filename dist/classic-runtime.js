import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OpaqueGTAOPass } from './ao-pass.js';
import { LightShaftsPass } from './light-shafts-pass.js';
import { installSoftSunShadows, getSoftSunShadowMapType } from './soft-shadows.js';

// The previous WebGL renderer and its composer chain, kept for `?renderer=classic`:
// `tools/collect-shader-programs.mjs` drives it to capture the GLSL that
// `tools/tsl-generate.mjs` turns into `node-fields.js`. Nothing here is reachable
// without that query string, so `three.module.js` never reaches ordinary visitors.
// Core classes are shared with `three/webgpu` through `three.core.js`, so a scene
// built by the node-engine modules renders here without translation.
export function createClassicRuntime(canvas) {
  // Shader chunks must be patched before any material compiles.
  installSoftSunShadows(THREE);
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  canvas.dataset.backend = 'classic';
  // `PMREMGenerator` is the only Three.js export whose implementation differs between
  // the two engine builds; every other class is shared through `three.core.js`.
  return {renderer, PMREMGenerator: THREE.PMREMGenerator, shadowMapType: getSoftSunShadowMapType(THREE), createClassicPipeline};
}

function createClassicPipeline({renderer, scene, camera, depth, filmShader}) {
  const ao = new OpaqueGTAOPass(scene, camera, depth);
  const shafts = new LightShaftsPass();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(ao);
  composer.addPass(shafts);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .65, .65, 1.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const antialias = new ShaderPass(FXAAShader);
  composer.addPass(antialias);
  const film = new ShaderPass(filmShader);
  composer.addPass(film);
  return {ao, shafts, composer, bloom, antialias, film};
}
