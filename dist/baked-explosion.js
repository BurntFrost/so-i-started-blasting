import * as THREE from 'three/webgpu';
import { markEffect } from './render-kit.js';

// The existing Blender atlas supplies soft edges; the scene owns its solid silhouette.
// Two ordinary-material batches crossfade adjacent atlas frames on every renderer.
export function createBakedExplosion({ canvas, cloud, camera }) {
  const cell = canvas.dataset.qualityCeiling === 'ultra' ? 512 : 256;
  const layers = [];
  const matrix = new THREE.Matrix4(), billboard = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), facing = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  let lastCamera = camera;
  canvas.dataset.explosionBake = 'loading';
  canvas.dataset.explosionAtlas = String(cell * 8);
  new THREE.TextureLoader().loadAsync(cell === 512 ? '/assets/explosion-puff-4k.webp' : '/assets/explosion-puff.webp').then(texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    for (let index = 0; index < 2; index++) {
      const map = index ? texture.clone() : texture;
      map.repeat.set((cell - 1) / (cell * 8), (cell - 1) / (cell * 4));
      map.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({ map, color: '#e8edf5', transparent: true,
        depthWrite: false, alphaTest: .003, opacity: 0 });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.5, 2.5), material, cloud.instanceMatrix.count);
      mesh.name = index ? 'Mushroom cloud next atlas frame' : 'Baked volumetric mushroom cloud lobes';
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 1 + index;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      markEffect(mesh);
      cloud.parent.add(mesh);
      layers.push(mesh);
    }
    canvas.dataset.explosionBake = 'ready';
    canvas.dispatchEvent(new Event('explosion-ready'));
  }).catch(() => {
    canvas.dataset.explosionBake = 'fallback';
    canvas.dispatchEvent?.(new Event('explosion-ready'));
  });

  function updateView(viewCamera = lastCamera) {
    if (!layers.length) return;
    if (viewCamera) {
      lastCamera = viewCamera;
      viewCamera.getWorldQuaternion(facing);
      cloud.parent.getWorldQuaternion(parentRotation).invert();
      facing.premultiply(parentRotation);
    }
    for (let i = 0; i < cloud.count; i++) {
      cloud.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      billboard.compose(position, facing, scale);
      for (const mesh of layers) mesh.setMatrixAt(i, billboard);
    }
    for (const mesh of layers) { mesh.count = cloud.count; mesh.instanceMatrix.needsUpdate = true; }
  }

  return {
    get ready() { return layers.length === 2; },
    update(time, atlasFrame = THREE.MathUtils.clamp((time - 4) / 16, 0, 1) * 31) {
      if (!layers.length) return;
      const ignition = THREE.MathUtils.smoothstep(time, 4, 5.2);
      const frame = atlasFrame;
      const lower = Math.floor(frame), blend = frame - lower;
      for (let index = 0; index < layers.length; index++) {
        const mesh = layers[index], tile = Math.min(31, lower + index), map = mesh.material.map;
        map.offset.set(((tile % 8) + .5 / cell) / 8, (3 - Math.floor(tile / 8) + .5 / cell) / 4);
        mesh.material.opacity = ignition * (index ? blend : 1 - blend) * .88;
        mesh.visible = cloud.visible && time > 4 && mesh.material.opacity > .001;
        mesh.userData.bakeFrame = frame;
      }
      updateView();
    },
    updateView
  };
}
