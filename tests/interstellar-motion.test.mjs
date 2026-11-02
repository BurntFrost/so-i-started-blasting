import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCosmic } from '../dist/cosmic.js';
import { interstellarFlight } from '../dist/cosmic-motion.js';
import { sceneConfigs } from '../dist/scene-config.js';

function fixture(signal = AbortSignal.abort()) {
  const scene = new THREE.Scene(), canvas = new EventTarget();
  canvas.dataset = { quality: 'lite', pixelRatio: '1' };
  const camera = new THREE.PerspectiveCamera(66, 390 / 380, .1, 1600);
  camera.position.fromArray(sceneConfigs.interstellar.camera); camera.lookAt(...sceneConfigs.interstellar.target); camera.updateMatrixWorld(true);
  const manager = createCosmic({ scene, canvas, camera, assetSignal: signal });
  const at = time => { manager.update(time, { id: 'interstellar', ...sceneConfigs.interstellar }); manager.updateView(); };
  at(0);
  return { scene, canvas, camera, manager, at, craft: scene.getObjectByName('Survey craft') };
}

test('craft follows a continuous three-dimensional bank and plunge at constant physical scale', () => {
  const f = fixture(), positions = [], orientations = [];
  for (let frame = 0; frame <= 1800; frame++) {
    f.at(frame / 60);
    assert.deepEqual(f.craft.scale.toArray(), [1, 1, 1]);
    const projection = f.craft.position.clone().project(f.camera);
    assert.ok(Math.abs(projection.x) < .95 && Math.abs(projection.y) < .95, 'flight remains in the phone view');
    positions.push(f.craft.position.clone()); orientations.push(f.craft.quaternion.clone());
    if (frame) {
      assert.ok(positions[frame].distanceTo(positions[frame - 1]) < .2, 'no position jumps at path joins');
      assert.ok(orientations[frame].angleTo(orientations[frame - 1]) < .06, 'bank changes continuously at path joins');
    }
  }
  assert.ok(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)) > 30, 'approach climbs above the disk');
  const horizon = f.scene.getObjectByName('Opaque event horizon');
  assert.equal(horizon.material.transparent, false);
  assert.equal(horizon.material.depthWrite, true);
  assert.ok(f.craft.position.distanceTo(horizon.getWorldPosition(new THREE.Vector3())) + 5 < horizon.geometry.parameters.radius, 'final craft is fully enclosed by the opaque horizon');
});

test('path, bank and user orbit restore exactly after reverse seeks and scene switches', () => {
  const f = fixture(), expected = new THREE.Vector3(), rotation = new THREE.Quaternion();
  for (const time of [0, 3, 12, 20, 24, 27, 30]) {
    f.at(time); const before = [f.craft.position.toArray(), f.craft.quaternion.toArray()];
    f.at(30); f.manager.update(12, { id: 'armageddon', ...sceneConfigs.armageddon });
    f.camera.position.set(-70, 96, 120); f.at(time);
    assert.deepEqual([f.craft.position.toArray(), f.craft.quaternion.toArray()], before);
    assert.deepEqual(f.camera.position.toArray(), [-70, 96, 120], 'the flight never takes camera control');
    interstellarFlight(time, expected, rotation);
    assert.deepEqual(f.craft.position.toArray(), expected.toArray());
  }
});

test('the finished craft swaps in while paused without changing scale or path', async t => {
  const bytes = await readFile(new URL('../dist/assets/interstellar-craft.glb', import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let resolveAsset;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise(resolve => { resolveAsset = resolve; }));
  const f = fixture(new AbortController().signal); f.at(18);
  await Promise.resolve();
  const fallback = [...f.craft.children], before = f.craft.position.clone();
  assert.equal(f.canvas.dataset.interstellarCraft, 'loading');
  assert.ok(fallback.every(child => child.visible));
  const ready = new Promise(resolve => f.canvas.addEventListener('animation-ready', resolve, { once: true }));
  resolveAsset(asset); await ready; f.at(18);
  assert.equal(f.canvas.dataset.interstellarCraft, 'ready');
  assert.ok(fallback.every(child => !child.visible));
  assert.ok(f.craft.getObjectByName('SurveyCraft'));
  assert.deepEqual(f.craft.position.toArray(), before.toArray());
  assert.deepEqual(f.craft.scale.toArray(), [1, 1, 1]);
  let triangles = 0; f.scene.traverseVisible(object => { if (object.isMesh) triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3; });
  assert.ok(triangles < 150000, `phone scene retains its geometry budget: ${triangles}`);
});
