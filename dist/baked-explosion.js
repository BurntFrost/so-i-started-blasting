import * as THREE from 'three';

// 32 Blender volume renders, packed left-to-right in eight columns.
// Sampling absolute scene time keeps pause, replay, and reverse scrubbing exact.
export function createBakedExplosion({ canvas, cloud, core }) {
  let smoke;
  const uniforms = { atlas: { value: null }, frame: { value: 0 }, opacity: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 puffUv;
    void main(){
      puffUv=uv;
      vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      gl_Position=projectionMatrix*mvPosition;
    }`,
    fragmentShader: `uniform sampler2D atlas;uniform float frame,opacity;varying vec2 puffUv;
    vec4 sampleFrame(float index){
      vec2 cell=vec2(mod(index,8.),3.-floor(index/8.));
      vec2 uv=(cell+(puffUv*255.+.5)/256.)/vec2(8.,4.);
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
  // loadAsync converts browser/network failures to the existing procedural fallback.
  new THREE.TextureLoader().loadAsync('/assets/explosion-puff.webp').then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    uniforms.atlas.value = texture;
    smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5, 2.5), material, cloud.instanceMatrix.count);
    smoke.instanceMatrix = cloud.instanceMatrix;
    smoke.name = 'Baked volumetric mushroom cloud lobes';
    smoke.frustumCulled = false;
    smoke.renderOrder = 1;
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
