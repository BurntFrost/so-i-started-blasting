import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTerrestrial } from '../dist/terrestrial.js';
import { faultSection, tripodFoot } from '../dist/terrestrial-motion.js';

async function asset(file) {
  const bytes = await fs.readFile(new URL(`../dist/assets/${file}`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const scenes = [
  { id: '2012', world: 'city', file: 'continental-motion.glb', status: 'continentalMotion', names: ['Western continental crust', 'Eastern continental crust', 'Jagged continental chasm'] },
  { id: 'twister', world: 'landscape', file: 'tornado-motion.glb', status: 'tornadoMotion', names: ['Continuous condensation funnel'] }
];
for (const spec of scenes) test(`${spec.id} installs the actual baked geometry and stops CPU vertex/normal writes`, async t => {
  const baked = await asset(spec.file);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => baked);
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => { throw new Error('atlas not required'); });
  const scene = new THREE.Scene(), canvas = new EventTarget(); canvas.dataset = { quality: 'balanced' };
  let events = 0; canvas.addEventListener('animation-ready', () => events++);
  const manager = createTerrestrial({ scene, canvas, camera: new THREE.PerspectiveCamera() });
  const at = time => manager.update(time, { id: spec.id, world: spec.world });
  at(8);
  const meshes = spec.names.map(name => scene.getObjectByName(name));
  const materials = meshes.map(mesh => mesh.material), oldGeometry = meshes.map(mesh => mesh.geometry);
  let disposed = 0; oldGeometry.forEach(geometry => geometry.addEventListener('dispose', () => disposed++));
  await new Promise(setImmediate); at(18);
  assert.equal(canvas.dataset[spec.status], 'ready'); assert.equal(events, 1); assert.equal(disposed, meshes.length);
  const snapshots = meshes.map((mesh, i) => {
    assert.equal(mesh.material, materials[i]); assert.notEqual(mesh.geometry, oldGeometry[i]);
    assert.ok(mesh.geometry.morphAttributes.normal.length >= 10);
    return { geometry: mesh.geometry, position: mesh.geometry.attributes.position.version,
      normal: mesh.geometry.attributes.normal.version, weights: mesh.morphTargetInfluences.slice(),
      point: mesh.getVertexPosition(0, new THREE.Vector3()).toArray() };
  });
  at(29); at(6); at(18);
  meshes.forEach((mesh, i) => {
    const before = snapshots[i]; assert.equal(mesh.geometry, before.geometry);
    assert.equal(mesh.geometry.attributes.position.version, before.position);
    assert.equal(mesh.geometry.attributes.normal.version, before.normal);
    assert.deepEqual(mesh.morphTargetInfluences, before.weights);
    assert.deepEqual(mesh.getVertexPosition(0, new THREE.Vector3()).toArray(), before.point);
  });
  manager.update(0, { id: 'independence-day', world: 'city' }); at(18);
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.morphTargetInfluences, snapshots[i].weights));
});
for (const spec of scenes) test(`${spec.id} retains a reversible procedural fallback when motion requests fail`, async t => {
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => { throw new Error('intentional motion failure'); });
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => { throw new Error('intentional atlas failure'); });
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'lite' } };
  const manager = createTerrestrial({ scene, canvas, camera: new THREE.PerspectiveCamera() });
  const at = time => manager.update(time, { id: spec.id, world: spec.world });
  at(18); await new Promise(setImmediate);
  assert.equal(canvas.dataset[spec.status], 'fallback');
  const meshes = spec.names.map(name => scene.getObjectByName(name));
  const before = meshes.map(mesh => Array.from(mesh.geometry.attributes.position.array));
  at(30); at(18);
  meshes.forEach((mesh, i) => assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), before[i]));
});
test('travelling fault front reaches the near end before the far end', () => {
  assert.ok(faultSection(6, -90).width > faultSection(6, 90).width + 1);
  assert.ok(faultSection(30, 90).width > 10);
});
test('tripod foot world coordinates remain fixed during stance, then lift during swing', () => {
  const a = tripodFoot(8, 0, 0, 22, 14, 1.16), b = tripodFoot(8.5, 0, 0, 22, 14, 1.16);
  assert.equal(a.x, b.x); assert.equal(a.z, b.z); assert.equal(a.lift, 0);
  assert.ok(tripodFoot(10.2, 0, 0, 22, 14, 1.16).lift > 5);
});

test('actual baked poses remain finite and attached between every Hermite key', async () => {
  const { sampleBakedWeights } = await import('../dist/baked-motion.js');
  const point = new THREE.Vector3();
  for (const file of ['continental-motion.glb', 'tornado-motion.glb']) {
    const baked = await asset(file), meshes = baked.scene.children.filter(mesh => mesh.isMesh);
    let narrowest = Infinity;
    for (let step = 0; step <= 300; step++) {
      const time = step / 10;
      for (const mesh of meshes) {
        sampleBakedWeights(time, mesh.userData.motionTimes, mesh.morphTargetInfluences);
        const geometry = mesh.geometry, normal = geometry.attributes.normal, targets = geometry.morphAttributes.normal;
        for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
          mesh.getVertexPosition(vertex, point); assert.ok(point.toArray().every(Number.isFinite));
          let nx = normal.getX(vertex), ny = normal.getY(vertex), nz = normal.getZ(vertex);
          targets.forEach((target, i) => { const w = mesh.morphTargetInfluences[i]; nx += target.getX(vertex) * w; ny += target.getY(vertex) * w; nz += target.getZ(vertex) * w; });
          assert.ok(Number.isFinite(nx + ny + nz));
          if (mesh.name === 'Funnel' && geometry.attributes.uv.getY(vertex) === 0) assert.equal(point.y, 0, 'the funnel root never floats away from its ground pose');
        }
      }
      const west = baked.scene.getObjectByName('WestCrust'), east = baked.scene.getObjectByName('EastCrust');
      if (west && east) for (let vertex = 0; vertex < west.geometry.attributes.position.count; vertex += 4) {
        const left = west.getVertexPosition(vertex, point).x, right = east.getVertexPosition(vertex, point).x;
        narrowest = Math.min(narrowest, right - left);
      }
    }
    if (file === 'continental-motion.glb') assert.ok(narrowest > .3, `the cubic interpolation never inverts the closed fault (${narrowest})`);
  }
});
