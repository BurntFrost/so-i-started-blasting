import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createImpactWave, impactWaveProfile, impactWaveState } from '../dist/impact-wave.js';

const bytes = await readFile(new URL('../dist/assets/deep-impact-wave.glb', import.meta.url));
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function asset() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let mesh;
  gltf.scene.traverse(object => { if (object.isMesh && object.userData.waveTimes) mesh = object; });
  assert.ok(mesh, 'the exported node carries the authored animation contract');
  return { gltf, mesh };
}
function fixture(t, request, { timeoutMs = 15000, wake = true, aborted = false } = {}) {
  const abort = new AbortController();
  if (aborted) abort.abort();
  let time = 0, controller;
  const events = [], requests = [];
  t.mock.method(GLTFLoader.prototype, 'loadAsync', url => { requests.push(url); return request(); });
  const canvas = { dataset: {}, dispatchEvent(event) { events.push(event.type); if (wake) controller.update(time); } };
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(220, 75, 8, 4), new THREE.MeshStandardMaterial({ transparent: true, opacity: .92, side: THREE.DoubleSide }));
  wave.userData.opaqueDepth = true; wave.userData.ssrReceiver = true;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(96), 3));
  const foam = new THREE.Points(geometry, new THREE.PointsMaterial());
  const fallback = wave.geometry, material = wave.material;
  controller = createImpactWave({ wave, foam, canvas, signal: abort.signal, timeoutMs });
  t.after(() => abort.abort());
  const at = value => { time = value; controller.update(time); };
  return { controller, at, abort, canvas, wave, foam, fallback, material, events, requests };
}
function snapshot(f) {
  return { position: f.wave.position.toArray(), scale: f.wave.scale.toArray(), weights: f.wave.morphTargetInfluences?.slice(),
    surface: Array.from(f.wave.geometry.attributes.position.array),
    foam: Array.from(f.foam.geometry.attributes.position.array), opacity: f.foam.material.opacity };
}
function posedVertex(geometry, index, pose) {
  const point = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
  if (pose) {
    const delta = new THREE.Vector3().fromBufferAttribute(geometry.morphAttributes.position[pose - 1], index);
    if (geometry.morphTargetsRelative) point.add(delta); else point.copy(delta);
  }
  return point;
}

test('the shipped Blender wave has bounded geometry, baked morph normals and a linear animation clip', async () => {
  const { gltf, mesh } = await asset(), geometry = mesh.geometry, { waveTimes, crestFrames, crestXs } = mesh.userData;
  assert.ok(bytes.length < 1_000_000, `the wave stays below its 1 MB download budget (${bytes.length})`);
  assert.ok(geometry.index.count / 3 < 15000, 'authored wave stays within the phone geometry allocation');
  assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(mesh.quaternion.toArray(), [0, 0, 0, 1]);
  assert.equal(waveTimes[0], 14); assert.equal(waveTimes.at(-1), 30);
  assert.ok(waveTimes.every((time, index) => !index || time > waveTimes[index - 1]));
  assert.equal(crestFrames.length, waveTimes.length);
  assert.ok(crestXs.length > 40 && crestXs[0] < -180 && crestXs.at(-1) > 180);
  assert.ok(crestXs.every((x, index) => !index || x > crestXs[index - 1]));
  for (const frame of crestFrames) { assert.equal(frame.length, crestXs.length * 3); assert.ok(frame.every(Number.isFinite)); }
  assert.equal(geometry.morphAttributes.position.length, waveTimes.length - 1);
  assert.equal(geometry.morphAttributes.normal.length, waveTimes.length - 1);
  for (const attribute of [geometry.attributes.position, geometry.attributes.normal, geometry.attributes.uv,
    ...geometry.morphAttributes.position, ...geometry.morphAttributes.normal]) {
    assert.equal(attribute.count, geometry.attributes.position.count);
    assert.ok(attribute.array.every(Number.isFinite));
  }
  assert.ok(geometry.index.array.every(index => index < geometry.attributes.position.count));
  assert.equal(gltf.animations.length, 1);
  assert.equal(gltf.animations[0].duration, 16);
  assert.ok(gltf.animations[0].tracks.some(track => track.name.endsWith('.morphTargetInfluences')));
  for (const track of gltf.animations[0].tracks) assert.equal(track.getInterpolation(), THREE.InterpolateLinear);
});

test('exported crest curves agree with the actual mesh lip at every baked pose', async () => {
  const { mesh } = await asset(), geometry = mesh.geometry, { crestFrames, crestXs } = mesh.userData;
  const lipVertices = crestXs.map(x => {
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      if (Math.abs(geometry.attributes.position.getX(i) - x) < .001 && geometry.attributes.uv.getY(i) > .999) return i;
    }
    assert.fail(`missing lip vertex at x=${x}`);
  });
  for (const [pose, frame] of crestFrames.entries()) for (const [sample, index] of lipVertices.entries()) {
    const actual = posedVertex(geometry, index, pose), expected = new THREE.Vector3(...frame.slice(sample * 3, sample * 3 + 3));
    assert.ok(actual.distanceTo(expected) < .002, `pose ${pose}, sample ${sample} stays attached to the imported surface`);
  }
});

test('delayed adoption makes the closed wave opaque and refreshes the paused baked pose', async t => {
  const model = await asset(), pending = deferred(), f = fixture(t, () => pending.promise);
  let fallbackDisposals = 0, importedMaterialDisposals = 0;
  f.fallback.addEventListener('dispose', () => fallbackDisposals++);
  model.mesh.material.addEventListener('dispose', () => importedMaterialDisposals++);
  const authoredGeometry = model.mesh.geometry, materialVersion = f.material.version;
  assert.equal(f.canvas.dataset.impactWave, 'idle'); assert.equal(f.requests.length, 0);
  f.at(23); await flush();
  assert.equal(f.canvas.dataset.impactWave, 'loading'); assert.equal(f.wave.geometry, f.fallback);
  assert.equal(f.material.transparent, true); assert.equal(f.material.opacity, .92);
  pending.resolve(model.gltf); await f.controller.ready;
  assert.equal(f.wave.geometry, authoredGeometry);
  assert.equal(f.wave.material, f.material);
  assert.equal(f.material.transparent, false); assert.equal(f.material.opacity, 1);
  assert.equal(f.material.side, THREE.DoubleSide);
  assert.ok(f.material.version > materialVersion, 'adoption refreshes the material pipeline after removing alpha blending');
  assert.equal(f.wave.userData.opaqueDepth, true); assert.equal(f.wave.userData.ssrReceiver, true);
  assert.equal(f.canvas.dataset.impactWave, 'ready'); assert.equal(f.canvas.dataset.waveAnimation, 'baked-morph');
  assert.deepEqual(f.events, ['impact-wave-ready']);
  assert.deepEqual(f.wave.morphTargetInfluences, [0, 0, 1, 0, 0, 0]);
  assert.equal(fallbackDisposals, 1); assert.equal(importedMaterialDisposals, 1);
  const normals = t.mock.method(authoredGeometry, 'computeVertexNormals');
  const positionVersion = authoredGeometry.attributes.position.version;
  const point = {};
  for (const time of [0,14,15.5,17,20,22,23,25,27,28.5,30]) {
    f.at(time); const expected = snapshot(f), crest = { ...f.controller.crestAt(24, time, point) };
    f.at(time < 20 ? 29 : 6); f.at(time);
    assert.deepEqual(snapshot(f), expected, `${time} reverses exactly`);
    assert.deepEqual(f.controller.crestAt(24, time, point), crest);
    assert.ok(f.wave.morphTargetInfluences.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1));
    assert.ok(f.wave.morphTargetInfluences.reduce((a, b) => a + b, 0) <= 1.000001);
  }
  assert.equal(normals.mock.callCount(), 0, 'baked normals eliminate per-frame normal recomputation');
  assert.equal(authoredGeometry.attributes.position.version, positionVersion, 'authored vertex positions are not uploaded again each frame');
  assert.equal(f.requests.length, 1, 'replay and seeking reuse the same optional asset');
});

test('intermediate crest and morph weights use the same linear baked-pose interpolation', async t => {
  const model = await asset(), metadata = structuredClone(model.mesh.userData), f = fixture(t, async () => model.gltf);
  f.at(14); await f.controller.ready;
  for (let pose = 0; pose < metadata.waveTimes.length - 1; pose++) {
    const time = (metadata.waveTimes[pose] + metadata.waveTimes[pose + 1]) / 2;
    f.at(time);
    const weights = f.wave.morphTargetInfluences;
    assert.equal(weights[pose], .5);
    if (pose) assert.equal(weights[pose - 1], .5);
    for (const sample of [0, 13, 40, 67, 80]) {
      const a = metadata.crestFrames[pose], b = metadata.crestFrames[pose + 1], offset = sample * 3;
      const actual = f.controller.crestAt(metadata.crestXs[sample], time);
      for (const [axis, index] of [['x', 0], ['y', 1], ['z', 2]]) assert.ok(Math.abs(actual[axis] - (a[offset + index] + b[offset + index]) / 2) < .00001);
    }
  }
});

test('the initial swell emerges continuously with spray attached to its scaled lip', async t => {
  for (const authored of [false, true]) {
    const model = authored ? await asset() : null;
    const f = fixture(t, async () => { if (model) return model.gltf; throw new Error('Use fallback'); });
    f.at(14); await f.controller.ready;
    const geometry = f.wave.geometry, point = new THREE.Vector3();
    let lip = -1;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      if (Math.abs(geometry.attributes.position.getX(i)) < .001 && geometry.attributes.uv.getY(i) > .999) { lip = i; break; }
    }
    assert.ok(lip >= 0);
    const heights = [];
    for (const time of [14, 14.2, 14.65, 15, 15.3]) {
      f.at(time); f.wave.getVertexPosition(lip, point);
      const height = f.controller.crestAt(0, time).y;
      assert.ok(Math.abs(height - point.y * f.wave.scale.y) < .002, 'crest effects follow the rendered reveal');
      heights.push(height);
    }
    assert.ok(heights[0] < .1 && heights.at(-1) > 15, 'the wave grows from the sea instead of popping in at full height');
    assert.ok(heights.every((height, i) => !i || height > heights[i - 1]));
    const expected = snapshot(f); f.at(28); f.at(15.3); assert.deepEqual(snapshot(f), expected);
  }
});

test('a rejected download retains a moving, reversible procedural wave and its matching crest', async t => {
  const f = fixture(t, async () => { throw new Error('Forced asset failure'); });
  const materialVersion = f.material.version;
  f.at(20); await f.controller.ready;
  assert.equal(f.canvas.dataset.impactWave, 'fallback'); assert.equal(f.canvas.dataset.waveAnimation, 'procedural');
  assert.equal(f.wave.geometry, f.fallback); assert.deepEqual(f.events, ['impact-wave-ready']);
  assert.equal(f.wave.material, f.material); assert.equal(f.material.version, materialVersion);
  assert.equal(f.material.transparent, true); assert.equal(f.material.opacity, .92); assert.equal(f.material.side, THREE.DoubleSide);
  const before = snapshot(f); f.at(27); assert.notDeepEqual(snapshot(f), before); f.at(20); assert.deepEqual(snapshot(f), before);
  for (const x of [-175, 0, 175]) assert.deepEqual(f.controller.crestAt(x, 20), impactWaveProfile(1, impactWaveState(20).height, x, 20));
  assert.ok(f.fallback.attributes.position.array.every(Number.isFinite));
});

test('a timed-out download disposes late geometry without replacing the paused fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const model = await asset(), pending = deferred(), f = fixture(t, () => pending.promise, { timeoutMs: 20 });
  let disposed = 0; model.mesh.geometry.addEventListener('dispose', () => disposed++);
  f.at(22); await flush(); t.mock.timers.tick(20); await f.controller.ready;
  assert.equal(f.canvas.dataset.impactWave, 'fallback');
  const before = snapshot(f);
  pending.resolve(model.gltf); await flush();
  assert.equal(disposed, 1); assert.equal(f.wave.geometry, f.fallback);
  assert.deepEqual(snapshot(f), before); assert.deepEqual(f.events, ['impact-wave-ready']);
});

test('cancelled loading cannot adopt or wake a failed renderer when the asset arrives later', async t => {
  const model = await asset(), pending = deferred(), f = fixture(t, () => pending.promise);
  let disposed = 0; model.mesh.geometry.addEventListener('dispose', () => disposed++);
  f.at(23); await flush(); f.abort.abort(); await f.controller.ready;
  pending.resolve(model.gltf); await flush();
  assert.equal(disposed, 1); assert.equal(f.wave.geometry, f.fallback); assert.deepEqual(f.events, []);
  assert.notEqual(f.canvas.dataset.impactWave, 'ready');
});

test('already cancelled wave work does not request the asset', t => {
  const f = fixture(t, () => assert.fail('cancelled work must not load'), { aborted: true });
  f.at(24);
  assert.equal(f.requests.length, 0); assert.equal(f.wave.geometry, f.fallback);
  assert.ok(f.wave.geometry.attributes.position.array.every(Number.isFinite));
});
