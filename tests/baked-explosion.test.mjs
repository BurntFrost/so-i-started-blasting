import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBakedExplosion } from '../dist/baked-explosion.js';

test('baked volume loads once, preserves solid support, and seeks its atlas without history', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  const canvas = new EventTarget(); canvas.dataset = {};
  const cloud = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 2);
  const group = new THREE.Group(); group.add(cloud);
  const fallback = cloud.geometry, texture = new THREE.Texture();
  let finish, requests = 0, wakeups = 0;
  canvas.addEventListener('explosion-ready', () => wakeups++);
  THREE.TextureLoader.prototype.loadAsync = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
  try {
    const baked = createBakedExplosion({ canvas, cloud });
    baked.update(10); assert.equal(cloud.geometry, fallback);
    finish(texture); await new Promise(setImmediate);
    assert.equal(canvas.dataset.explosionBake, 'ready'); assert.equal(wakeups, 1);
    assert.equal(texture.generateMipmaps, false, 'atlas tiles cannot bleed through mipmaps');
    const smoke = group.getObjectByName('Baked volumetric mushroom cloud lobes');
    const next = group.getObjectByName('Mushroom cloud next atlas frame');
    assert.notEqual(smoke.instanceMatrix, cloud.instanceMatrix, 'billboards have independent camera-facing matrices');
    assert.equal(cloud.geometry, fallback, 'original cloud geometry remains available');
    assert.equal(smoke.material.isMeshBasicMaterial, true, 'the smoke uses the ordinary renderer path');
    baked.update(10);
    const first = [smoke.userData.bakeFrame, ...smoke.material.map.offset, smoke.material.opacity, next.material.opacity];
    assert.equal(cloud.visible, true); assert.equal(smoke.visible, true);
    assert.ok(smoke.material.opacity > 0 && next.material.opacity > 0, 'adjacent atlas frames crossfade');
    baked.update(25);
    assert.equal(cloud.visible, true, 'the detail helper does not remove the scene-owned silhouette');
    assert.equal(smoke.visible, true); assert.ok(smoke.material.opacity > .8);
    baked.update(10);
    assert.deepEqual([smoke.userData.bakeFrame, ...smoke.material.map.offset, smoke.material.opacity, next.material.opacity], first);
    baked.update(0); assert.equal(smoke.material.opacity, 0); assert.equal(smoke.visible, false);
    baked.update(30); assert.equal(smoke.userData.bakeFrame, 31);
    assert.equal(baked.ready, true);
    baked.update(8, 27);
    assert.equal(smoke.userData.bakeFrame, 27, 'ash can select a cooled atlas frame independently of scene time');
    cloud.visible = false; baked.update(12, 28);
    assert.equal(smoke.visible, false); assert.equal(next.visible, false, 'hidden emitters cannot leave billboard ghosts');
    cloud.visible = true; baked.update(8, 27);
    assert.equal(smoke.visible, true);
    assert.equal(requests, 1);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('the quality ceiling selects the atlas resolution and inset sampling bounds', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync, urls = [];
  THREE.TextureLoader.prototype.loadAsync = async url => { urls.push(url); return new THREE.Texture(); };
  const build = ceiling => {
    const canvas = new EventTarget(); canvas.dataset = ceiling ? { qualityCeiling: ceiling } : {};
    const cloud = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 2);
    new THREE.Group().add(cloud);
    return { canvas, cloud, baked: createBakedExplosion({ canvas, cloud }) };
  };
  try {
    const ultra = build('ultra'), standard = build(), high = build('high');
    await new Promise(setImmediate);
    assert.deepEqual(urls, ['/assets/explosion-puff-4k.webp', '/assets/explosion-puff.webp', '/assets/explosion-puff.webp']);
    assert.equal(ultra.canvas.dataset.explosionAtlas, '4096');
    assert.equal(standard.canvas.dataset.explosionAtlas, '2048'); assert.equal(high.canvas.dataset.explosionAtlas, '2048');
    for (const [instance, cell] of [[ultra, 512], [standard, 256]]) {
      const smoke = instance.cloud.parent.getObjectByName('Baked volumetric mushroom cloud lobes');
      instance.baked.update(30);
      assert.equal(smoke.userData.bakeFrame, 31);
      const map = smoke.material.map;
      assert.equal(map.repeat.x, (cell - 1) / (cell * 8));
      assert.equal(map.repeat.y, (cell - 1) / (cell * 4));
      assert.ok(map.offset.x > 7 / 8 && map.offset.x + map.repeat.x < 1, 'last cell stays inside its horizontal edges');
      assert.ok(map.offset.y > 0 && map.offset.y + map.repeat.y < .25, 'last cell stays inside its vertical edges');
    }
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('paused camera orbit reorients billboard planes without moving lobe centers', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = async () => new THREE.Texture();
  try {
    const canvas = new EventTarget(); canvas.dataset = {};
    const cloud = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 1);
    const group = new THREE.Group(); group.add(cloud);
    cloud.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(8, 30, -20), new THREE.Quaternion(), new THREE.Vector3(8, 12, 10)));
    const camera = new THREE.PerspectiveCamera(); camera.position.set(50, 30, 80); camera.lookAt(0, 20, 0);
    const baked = createBakedExplosion({ canvas, cloud, camera }); await new Promise(setImmediate); baked.update(18);
    const smoke = group.getObjectByName('Baked volumetric mushroom cloud lobes'), first = new THREE.Matrix4(); smoke.getMatrixAt(0, first);
    camera.position.set(-60, 45, 90); camera.lookAt(0, 20, 0); baked.updateView(camera);
    const after = new THREE.Matrix4(); smoke.getMatrixAt(0, after);
    assert.notDeepEqual(after.elements, first.elements);
    assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(after).toArray(), [8, 30, -20]);
    const actualFacing = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(); after.decompose(position, actualFacing, scale);
    assert.ok(actualFacing.angleTo(camera.quaternion) < .001);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

test('missing bake leaves the procedural geometry and material intact', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync = async () => { throw new Error('Asset unavailable'); };
  try {
    const canvas = new EventTarget(); canvas.dataset = {};
    const cloud = { geometry: {}, material: {} };
    let wakeups = 0; canvas.addEventListener('explosion-ready', () => wakeups++);
    const geometry = cloud.geometry, material = cloud.material;
    const baked = createBakedExplosion({ canvas, cloud });
    await new Promise(setImmediate); baked.update(10);
    assert.equal(canvas.dataset.explosionBake, 'fallback');
    assert.equal(wakeups, 1, 'failure wakes a paused scene so dependent readiness and fallback state settle');
    assert.equal(cloud.geometry, geometry); assert.equal(cloud.material, material);
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});
