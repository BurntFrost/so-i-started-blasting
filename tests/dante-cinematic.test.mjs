import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createTerrestrial } from '../dist/terrestrial.js';

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), canvas = { dataset: { quality, pixelRatio: '1' }, dispatchEvent() {} };
  const manager = createTerrestrial({ scene, canvas, camera: new THREE.PerspectiveCamera() });
  const at = time => manager.update(time, { id: 'dantes-peak', world: 'landscape' });
  at(0);
  return { scene, canvas, at, named: name => scene.getObjectByName(name) };
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const result = [];
  root.traverse(object => result.push({ name: object.name, visible: object.visible, matrix: object.matrix.toArray(),
    count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array) : null,
    colors: object.instanceColor ? Array.from(object.instanceColor.array) : null,
    opacity: object.material?.opacity, intensity: object.intensity }));
  return result;
}

test('Dante keeps a connected ash silhouette and continuing surge on every detail tier', () => {
  for (const quality of ['lite', 'balanced', 'high']) {
    const f = fixture(quality), plume = f.named('Continuous eruption column'), crown = f.named('Rolling ash crown'), surge = f.named('Pyroclastic surge front');
    assert.ok(plume, 'a connected main volume carries the plume silhouette');
    f.at(5); assert.equal(plume.visible, false); assert.equal(surge.visible, false);
    f.at(12); assert.equal(plume.visible, true); assert.ok(plume.scale.y > .4);
    f.at(22); const before = new THREE.Matrix4(); surge.getMatrixAt(0, before);
    f.at(30); const after = new THREE.Matrix4(); surge.getMatrixAt(0, after);
    assert.ok(after.elements[14] > before.elements[14] + 50, 'the surge continues advancing through the aftermath');
    assert.equal(plume.visible, true); assert.equal(surge.visible, true);
    assert.equal(crown.visible, true); assert.ok(crown.count >= 16, 'lower tiers retain the complete umbrella crown');
    assert.ok(after.elements[0] ** 2 + after.elements[2] ** 2 > after.elements[5] ** 2, 'the main surge billows remain low and broad');
  }
});

test('Dante uses smooth cloud geometry and closes the neighboring ridge summit', () => {
  const f = fixture(), cloud = f.named('Plinian eruption column'), ridge = f.named('Neighbouring ridge');
  assert.equal(cloud.geometry.type, 'SphereGeometry');
  assert.ok(cloud.geometry.index, 'indexed vertices retain shared smooth cloud normals');
  const positions = ridge.geometry.attributes.position, summit = [];
  let top = -Infinity;
  for (let i = 0; i < positions.count; i++) top = Math.max(top, positions.getY(i));
  for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getY(i) - top) < .001) summit.push([positions.getX(i), positions.getZ(i)]);
  assert.ok(summit.length > 10);
  assert.ok(summit.every(([x, z]) => Math.abs(x - 7) < .001 && Math.abs(z + 4) < .001), 'the neighboring ridge converges to a closed summit instead of an open ring');
});

test('Dante geometry, plume colors and effects restore exactly on reverse seeking', () => {
  const f = fixture(), root = f.named("Dante's Peak — Plinian eruption");
  f.at(18); const first = snapshot(root);
  f.at(27); assert.notDeepEqual(snapshot(root), first);
  f.at(18); assert.deepEqual(snapshot(root), first);
  for (const time of [0, 6, 9.4, 13.5, 17.7, 24, 30]) {
    f.at(time);
    root.traverse(object => {
      if (object.instanceMatrix) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
      if (object.geometry) assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
    });
  }
});

test('Dante retains the procedural ash silhouette if the optional atlas fails', async t => {
  const loader = t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => { throw new Error('atlas unavailable'); });
  const f = fixture();
  await new Promise(resolve => setImmediate(resolve));
  f.at(22);
  assert.equal(loader.mock.calls.filter(call => call.arguments[0].includes('explosion-puff')).length, 3);
  assert.equal(f.canvas.dataset.danteBake, 'fallback');
  for (const name of ['Continuous eruption column', 'Plinian eruption column', 'Rolling ash crown', 'Pyroclastic surge front']) {
    const object = f.named(name);
    assert.equal(object.visible, true);
    assert.ok(object.material.opacity >= .8, `${name} remains visible without the atlas`);
  }
});

test('Dante remains exactly reversible after all three ash atlases become ready', async t => {
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => new THREE.Texture({ width: 2048, height: 1024 }));
  const f = fixture(), root = f.named("Dante's Peak — Plinian eruption");
  await new Promise(resolve => setImmediate(resolve));
  f.at(20); const first = snapshot(root);
  assert.equal(f.canvas.dataset.danteBake, 'ready');
  assert.ok(f.named('Pyroclastic surge front').material.opacity < .1, 'loaded ash detail replaces the solid fallback appearance');
  f.at(30); assert.notDeepEqual(snapshot(root), first);
  f.at(20); assert.deepEqual(snapshot(root), first);
});
