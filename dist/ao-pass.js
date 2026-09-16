import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

// r170's internal target is retained; only scheduling, noise and sizing are adapted.
export class OpaqueGTAOPass extends GTAOPass {
  constructor(scene, camera, depth) {
    super(scene, camera, 1, 1);
    this.depth = depth;
    this.resolutionScale = 1;
    this._renderGBuffer = false;
    this.updateGtaoMaterial({radius: 6, distanceExponent: 1, thickness: 1, scale: 1, samples: 16});
    this.updatePdMaterial({rings: 2, samples: 16});
    this.blendIntensity = 1;
  }
  generateNoise(size = 64) {
    let seed = 170;
    const simplex = new SimplexNoise({random: () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }});
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let c = 0; c < 4; c++) {
      data[(y * size + x) * 4 + c] = (simplex.noise(x + (c % 2) * size, y + Math.floor(c / 2) * size) * .5 + .5) * 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.needsUpdate = true;
    return texture;
  }
  setSize(width, height) {
    this.depth.opaqueInverseSize.value.set(1 / width, 1 / height);
    super.setSize(Math.max(1, Math.floor(width * this.resolutionScale)), Math.max(1, Math.floor(height * this.resolutionScale)));
  }
  prepass(renderer) {
    const {camera, scene, depth} = this;
    depth.opaqueDepthAvailable.value = 0;
    camera.updateMatrixWorld();
    depth.opaqueProjectionInverse.value.copy(camera.projectionMatrixInverse);
    depth.opaqueCameraWorld.value.copy(camera.matrixWorld);
    depth.opaqueNear.value = camera.near; depth.opaqueFar.value = camera.far;
    const mask = camera.layers.mask, override = scene.overrideMaterial;
    const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear;
    const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate;
    try {
      camera.layers.set(0);
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      this.overrideVisibility();
      renderer.setRenderTarget(this.normalRenderTarget);
      renderer.autoClear = false; renderer.setClearColor(0x7777ff, 1); renderer.clear();
      scene.overrideMaterial = this.normalMaterial;
      renderer.render(scene, camera);
      depth.opaqueDepth.value = this.depthTexture; depth.opaqueDepthAvailable.value = 1;
    } finally {
      this.restoreVisibility();
      scene.overrideMaterial = override; camera.layers.mask = mask;
      renderer.shadowMap.autoUpdate = shadowAuto; renderer.shadowMap.needsUpdate = shadowNeeds;
      renderer.autoClear = autoClear; renderer.setClearColor(color, alpha);
      renderer.setRenderTarget(target, face, mip);
    }
  }
  dispose() {
    super.dispose(); this.gtaoMaterial.dispose(); this.blendMaterial.dispose();
  }
}
