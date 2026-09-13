import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBakedExplosion } from '../dist/baked-explosion.js';

test('baked volume loads once, preserves fallback until ready, and seeks without history', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  const canvas = new EventTarget(); canvas.dataset = {};
  const cloud = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 2);
  const group = new THREE.Group(); group.add(cloud);
  const core = { visible: true, material: { opacity: 1 } }, fallback = cloud.geometry;
  const texture = new THREE.Texture();
  let finish, requests = 0, wakeups = 0;
  canvas.addEventListener('explosion-ready', () => wakeups++);
  THREE.TextureLoader.prototype.loadAsync = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
  try {
    const baked = createBakedExplosion({ canvas, cloud, core });
    baked.update(10);
    assert.equal(cloud.geometry, fallback);
    assert.equal(core.visible, true);
    finish(texture); await new Promise(setImmediate);
    assert.equal(canvas.dataset.explosionBake, 'ready');
    assert.equal(wakeups, 1);
    assert.equal(texture.generateMipmaps, false, 'atlas tiles cannot bleed through mipmaps');
    const smoke = group.getObjectByName('Baked volumetric mushroom cloud lobes');
    assert.equal(smoke.instanceMatrix, cloud.instanceMatrix, 'both layers use the same 3D lobe positions');
    assert.equal(cloud.geometry, fallback, 'original flame geometry remains available');
    baked.update(10);
    const first = smoke.material.uniforms.frame.value;
    assert.equal(core.visible, true);
    assert.equal(cloud.visible, true);
    assert.ok(smoke.material.uniforms.opacity.value < 1, 'hot geometry shows through the smoke');
    baked.update(25);
    assert.equal(core.visible, false); assert.equal(cloud.visible, false); assert.equal(smoke.visible, true);
    assert.equal(smoke.material.uniforms.opacity.value, 1);
    baked.update(10);
    assert.equal(smoke.material.uniforms.frame.value, first);
    assert.equal(core.visible, true); assert.equal(cloud.visible, true);
    baked.update(0); assert.equal(smoke.material.uniforms.opacity.value, 0); assert.equal(smoke.visible, false);
    baked.update(30); assert.equal(smoke.material.uniforms.frame.value, 31);
    assert.equal(requests, 1);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('missing bake leaves the procedural geometry and fireball intact', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = async () => { throw new Error('Asset unavailable'); };
  try {
    const canvas = { dataset: {} }, cloud = { geometry: {}, material: {} }, core = { visible: true };
    const geometry = cloud.geometry, material = cloud.material;
    const baked = createBakedExplosion({ canvas, cloud, core });
    await new Promise(setImmediate); baked.update(10);
    assert.equal(canvas.dataset.explosionBake, 'fallback');
    assert.equal(cloud.geometry, geometry); assert.equal(cloud.material, material);
    assert.equal(core.visible, true);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});
