import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadOptionalAssets } from '../dist/asset-loading.js';

const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function trackedTexture() {
  const texture = new THREE.Texture();
  const counts = { disposed: 0, closed: 0 };
  texture.source.data = { close() { counts.closed++; } };
  texture.addEventListener('dispose', () => counts.disposed++);
  return { texture, counts };
}

test('a stalled asset reaches a configurable deadline without discarding successful assets', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ready = trackedTexture();
  const pending = loadOptionalAssets([() => ready.texture, () => new Promise(() => {})], { timeoutMs: 25 });
  await flush();
  t.mock.timers.tick(25);
  const results = await pending;
  assert.equal(results[0].value, ready.texture);
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /timed out/);
  assert.deepEqual(ready.counts, { disposed: 0, closed: 0 });
});

test('textures arriving after a timeout are disposed once and cannot change the settled result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred(), resource = trackedTexture();
  const pending = loadOptionalAssets([() => late.promise], { timeoutMs: 10 });
  await flush();
  t.mock.timers.tick(10);
  const results = await pending;
  late.resolve(resource.texture);
  await flush();
  assert.equal(results[0].status, 'rejected');
  assert.deepEqual(resource.counts, { disposed: 1, closed: 1 });
});

test('cancellation frees ready assets and late model geometry, shared materials and textures', async () => {
  const controller = new AbortController(), ready = trackedTexture(), late = deferred();
  const pending = loadOptionalAssets([() => ready.texture, () => late.promise], { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush();
  controller.abort();
  await rejected;
  assert.deepEqual(ready.counts, { disposed: 1, closed: 1 });
  const resource = trackedTexture(), geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ map: resource.texture, normalMap: resource.texture });
  let geometries = 0, materials = 0;
  geometry.addEventListener('dispose', () => geometries++);
  material.addEventListener('dispose', () => materials++);
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, [material, material]), new THREE.Mesh(geometry, material));
  late.resolve({ scene, scenes: [scene] });
  await flush();
  assert.equal(geometries, 1);
  assert.equal(materials, 1);
  assert.deepEqual(resource.counts, { disposed: 1, closed: 1 });
});

test('already cancelled work never starts a loader', async () => {
  const controller = new AbortController(); controller.abort();
  let started = false;
  await assert.rejects(loadOptionalAssets([() => { started = true; }], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(started, false);
});

test('immediate failures and rejection after timeout are handled without unhandled rejections', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred();
  const pending = loadOptionalAssets([() => { throw new Error('Invalid asset'); }, () => late.promise], { timeoutMs: 10 });
  await flush();
  t.mock.timers.tick(10);
  const results = await pending;
  assert.match(results[0].reason.message, /Invalid asset/);
  assert.match(results[1].reason.message, /timed out/);
  late.reject(new Error('Late failure'));
  await flush();
});
