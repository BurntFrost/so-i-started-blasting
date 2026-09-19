import * as THREE from 'three';
import { createShaderMaterial } from './shader-program.js';
import { markEffect } from './render-kit.js';

// 32 Blender volume renders, packed left-to-right in eight columns.
// Sampling absolute scene time keeps pause, replay, and reverse scrubbing exact.
export function createBakedExplosion({ canvas, cloud, core }) {
  let smoke;
  // ULTRA-capable displays receive the 512-pixel bake; the 256-pixel atlas remains the default.
  const cell = canvas.dataset.qualityCeiling === 'ultra' ? 512 : 256;
  const uniforms = { atlas: { value: null }, frame: { value: 0 }, opacity: { value: 1 }, cell: { value: cell } };
  const material = createShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 puffUv;
    void main(){
      puffUv=uv;
      vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      gl_Position=projectionMatrix*mvPosition;
    }`,
    fragmentShader: `uniform sampler2D atlas;uniform float frame,opacity,cell;varying vec2 puffUv;
    vec4 sampleFrame(float index){
      vec2 tile=vec2(mod(index,8.),3.-floor(index/8.));
      vec2 uv=(tile+(puffUv*(cell-1.)+.5)/cell)/vec2(8.,4.);
      vec4 texel=texture2D(atlas,uv);
      return vec4(texel.rgb*texel.a,texel.a);
    }
    void main(){
      vec4 puff=mix(sampleFrame(floor(frame)),sampleFrame(min(31.,floor(frame)+1.)),fract(frame));
      if(puff.a<.003)discard;
      gl_FragColor=vec4(puff.rgb/max(puff.a,.001),puff.a*opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  canvas.dataset.explosionBake = 'loading';
  canvas.dataset.explosionAtlas = String(cell * 8);
  // loadAsync converts browser/network failures to the existing procedural fallback.
  new THREE.TextureLoader().loadAsync(cell === 512 ? '/assets/explosion-puff-4k.webp' : '/assets/explosion-puff.webp').then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    uniforms.atlas.value = texture;
    smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5, 2.5), material, cloud.instanceMatrix.count);
    smoke.instanceMatrix = cloud.instanceMatrix;
    smoke.name = 'Baked volumetric mushroom cloud lobes';
    smoke.frustumCulled = false;
    smoke.renderOrder = 1;
    markEffect(smoke); markEffect(cloud);
    cloud.parent.add(smoke);
    cloud.material.transparent = true;
    cloud.material.depthWrite = false;
    cloud.material.needsUpdate = true;
    canvas.dataset.explosionBake = 'ready';
    canvas.dispatchEvent(new Event('explosion-ready'));
  }).catch(() => {
    material.dispose();
    canvas.dataset.explosionBake = 'fallback';
  });
  return {
    update(time) {
      if (!smoke) return;
      const ignition = THREE.MathUtils.smoothstep(time, 4, 6);
      const fire = 1 - THREE.MathUtils.smoothstep(time, 10, 18);
      uniforms.frame.value = THREE.MathUtils.clamp((time - 4) / 16, 0, 1) * 31;
      // Keep fiery geometry beneath translucent smoke, then hand off to the cooled bake.
      uniforms.opacity.value = ignition * (1 - .45 * fire);
      smoke.count = cloud.count;
      smoke.visible = time > 4;
      cloud.visible = time > 4 && fire > 0;
      cloud.material.opacity = fire * .85;
      core.visible = time > 4 && fire > 0;
      core.material.opacity = ignition * fire * .32;
    }
  };
}
