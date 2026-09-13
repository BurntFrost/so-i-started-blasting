import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { createTerrestrial } from '../dist/terrestrial.js';
import { createCosmic } from '../dist/cosmic.js';
import { createProduction } from '../dist/production.js';

const config = (id, world = 'city') => ({ id, world, space: world === 'space', environment: { skyTint: '#fff', skyExposure: .6, skyStorm: .3 } });
function snapshot(group) {
  group.updateMatrixWorld(true);
  const values = [];
  group.traverse(object => {
    values.push(object.name, object.visible, ...object.matrix.elements);
    if (object.instanceMatrix) values.push(object.count, ...object.instanceMatrix.array);
    if (object.geometry) values.push(...object.geometry.attributes.position.array);
  });
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

test('procedural factories construct only visited IDs and scrub reversibly in any visit order', () => {
  for (const [create, ids, names, world, extra] of [
    [createTerrestrial, ['war-of-the-worlds', 'terminator-2', '2012'], ['War of the Worlds — tripod invasion', 'Terminator 2 — nuclear firestorm', '2012 — continental rupture'], 'city', 0],
    [createCosmic, ['interstellar', 'knowing', 'armageddon'], ['interstellar-black-hole', 'knowing-solar-flare', 'armageddon-asteroid'], 'space', 1]
  ]) {
    const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
    camera.position.set(122, 78, 155);
    const renderer = create({ scene, canvas, camera });
    assert.equal(scene.children.length, 0, 'construction does not allocate unvisited scene graphs');
    renderer.update(18, config('independence-day'));
    assert.equal(scene.children.length, 0);
    for (const [i, id] of ids.entries()) {
      renderer.update(18, config(id, world)); renderer.updateView?.();
      assert.equal(scene.children.length, i + 1 + extra);
      const group = scene.getObjectByName(names[i]);
      assert.equal(group.visible, true);
      const first = snapshot(group);
      renderer.update(27, config(id, world)); renderer.updateView?.();
      assert.notEqual(snapshot(group), first);
      renderer.update(18, config(id, world)); renderer.updateView?.();
      assert.equal(snapshot(group), first);
      renderer.update(5, config('independence-day'));
      assert.equal(group.visible, false);
      renderer.update(18, config(id, world)); renderer.updateView?.();
      assert.equal(snapshot(group), first);
    }
    const other = new THREE.Scene(), replay = create({ scene: other, canvas, camera });
    for (const id of [...ids].reverse()) replay.update(18, config(id, world));
    replay.updateView?.();
    for (const [i, id] of ids.entries()) {
      renderer.update(18, config(id, world)); renderer.updateView?.();
      replay.update(18, config(id, world)); replay.updateView?.();
      assert.equal(snapshot(scene.getObjectByName(names[i])), snapshot(other.getObjectByName(names[i])), 'seed does not depend on visit order');
    }
  }
});

function productionWorld() {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#456789', .012); scene.environmentIntensity = .83;
  const city = new THREE.Group(), landscape = new THREE.Group(), ship = new THREE.Group(); scene.add(city, landscape, ship);
  const material = () => new THREE.MeshStandardMaterial({ color: '#789abc' });
  const mesh = geometry => new THREE.Mesh(geometry || new THREE.BoxGeometry(), material());
  const ground = mesh(), core = mesh(), tower = mesh(), blast = mesh(), wave = mesh(new THREE.PlaneGeometry(220, 75, 5, 5));
  const buildings = Array.from({ length: 15 }, (_, i) => { const b = mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0)); b.position.x = i * 8; b.scale.set(4, 20, 4); city.add(b); return b; });
  const baselineShip = mesh(); ship.add(baselineShip, core); city.add(ground, tower); landscape.add(mesh(new THREE.PlaneGeometry(200, 200)));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } } }));
  const errors = [], camera = new THREE.PerspectiveCamera(), canvas = { dataset: { quality: 'balanced' } };
  return { scene, city, landscape, ship, buildings, ground, core, tower, blast, wave, planet, camera, canvas,
    foam: mesh(new THREE.PlaneGeometry()), beam: mesh(), meteor: mesh(), tail: mesh(), baselineShip, errors,
    renderer: { capabilities: { getMaxAnisotropy: () => 1 } }, onAssetError: stage => errors.push(stage) };
}
function kit() {
  const scene = new THREE.Group();
  for (const name of ['Tower_A', 'Tower_B', 'Tower_C', 'Tower_D', 'Tower_E']) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 10, 10, 10), new THREE.MeshStandardMaterial({ color: '#6789ab' }));
    part.name = name; scene.add(part);
  }
  return { scene };
}
async function withAssets(failures, run) {
  const original = [GLTFLoader.prototype.loadAsync, RGBELoader.prototype.loadAsync, THREE.TextureLoader.prototype.loadAsync];
  GLTFLoader.prototype.loadAsync = async function (url) {
    if (failures.some(value => url.includes(value))) throw new Error('Injected model failure');
    return url.includes('city-kit') ? kit() : { scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())) };
  };
  RGBELoader.prototype.loadAsync = async () => { throw new Error('Injected HDR failure'); };
  THREE.TextureLoader.prototype.loadAsync = async function (url) {
    if (failures.some(value => url.includes(value))) throw new Error('Injected texture failure');
    return new THREE.Texture();
  };
  try { await run(); } finally {
    [GLTFLoader.prototype.loadAsync, RGBELoader.prototype.loadAsync, THREE.TextureLoader.prototype.loadAsync] = original;
  }
}

test('failed optional models and maps preserve baseline city and ship and do not own environment state', async () => {
  await withAssets(['city-kit', 'mothership', 'concrete', 'asphalt'], async () => {
    const world = productionWorld(), initialFog = world.scene.fog.color.getHex();
    const production = await createProduction(world);
    assert.equal(production.environment, null);
    assert.equal(world.errors.length, 9);
    assert.equal(new Set(world.errors).size, 9);
    production.update(18, config('war-of-the-worlds'));
    assert.equal(world.canvas.dataset.authoredAssets, 'degraded');
    assert.ok(world.buildings.every(building => building.visible));
    assert.equal(world.tower.visible, true);
    assert.equal(world.baselineShip.visible, true);
    assert.equal(world.ground.material.map, null);
    assert.equal(world.scene.fog.color.getHex(), initialFog);
    assert.equal(world.scene.fog.density, .012);
    assert.equal(world.scene.environmentIntensity, .83);
  });
});

test('stalled optional models settle after 15 seconds and keep procedural fallback usable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withAssets(['concrete', 'asphalt'], async () => {
    GLTFLoader.prototype.loadAsync = () => new Promise(() => {});
    const world = productionWorld();
    let production;
    const pending = createProduction(world).then(result => { production = result; });
    await new Promise(setImmediate);
    t.mock.timers.tick(15_000);
    await new Promise(setImmediate);
    assert.ok(production, 'a stalled optional asset must not keep authored readiness pending');
    await pending;
    production.update(18, config('war-of-the-worlds'));
    assert.equal(world.canvas.dataset.authoredAssets, 'degraded');
    assert.equal(world.errors.length, 9);
    assert.equal(new Set(world.errors).size, 9);
    assert.ok(world.buildings.every(building => building.visible));
    assert.equal(world.tower.visible, true);
    assert.equal(world.baselineShip.visible, true);
  });
});

test('cancelled authored loading cannot mutate the world when a model arrives later', async () => {
  await withAssets(['concrete', 'asphalt'], async () => {
    let resolveModel;
    const model = new Promise(resolve => { resolveModel = resolve; });
    GLTFLoader.prototype.loadAsync = () => model;
    const controller = new AbortController(), world = productionWorld();
    world.assetSignal = controller.signal;
    const before = snapshot(world.scene);
    const pending = assert.rejects(createProduction(world), { name: 'AbortError' });
    await new Promise(setImmediate);
    controller.abort();
    await pending;
    resolveModel(kit());
    await new Promise(setImmediate);
    assert.equal(snapshot(world.scene), before);
    assert.equal(world.errors.length, 0);
  });
});

test('BALANCED uses stepped medium geometry and uploads only visible city batches', async () => {
  await withAssets(['concrete-normal'], async () => {
    const world = productionWorld(), production = await createProduction(world);
    production.update(18, config('terminator-2'));
    const batches = world.city.children.filter(object => object.isInstancedMesh);
    const balanced = batches.filter(mesh => mesh.visible);
    assert.equal(balanced.length, 5);
    assert.deepEqual(balanced.map(mesh => mesh.geometry.index.count / 3), [36, 24, 36, 36, 60]);
    assert.ok(world.buildings.every(building => !building.visible));
    const versions = batches.map(mesh => mesh.instanceMatrix.version);
    production.update(27, config('terminator-2'));
    batches.forEach((mesh, i) => assert.equal(mesh.instanceMatrix.version, versions[i] + Number(mesh.visible)));
    const beforeSpace = batches.map(mesh => mesh.instanceMatrix.version);
    production.update(25, config('interstellar', 'space'));
    assert.deepEqual(batches.map(mesh => mesh.instanceMatrix.version), beforeSpace);
    world.canvas.dataset.quality = 'high';
    production.update(18, config('terminator-2'));
    const high = batches.filter(mesh => mesh.visible);
    assert.ok(high.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0) > balanced.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0) * 20);
    world.canvas.dataset.quality = 'ultra';
    production.update(18, config('terminator-2'));
    assert.deepEqual(batches.filter(mesh => mesh.visible), high, 'ULTRA renders the detailed HIGH city batches');
    assert.ok(high.every(mesh => mesh.castShadow), 'ULTRA keeps HIGH shadow casting');
    assert.ok(world.errors.includes('concrete-normal'));
    assert.equal(production.assetStatus['city-model'], 'ready');
    assert.equal(world.baselineShip.visible, false);
  });
});
