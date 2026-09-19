import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createTerrestrial } from '../dist/terrestrial.js';
import { createCosmic } from '../dist/cosmic.js';
import { createProduction } from '../dist/production.js';

const config = (id, world = 'city') => ({ id, world, space: world === 'space', environment: { skyTint: '#fff', skyExposure: .6, skyStorm: .3 } });
// The superstorm hangs icicles from the baseline city's roof edges and the visitor's swarm consumes the landscape trees.
const cityBuildings = () => Array.from({ length: 6 }, (_, i) => ({ userData: { x: -40 + i * 17, z: 3 + (i % 2) * 17, h: 8 + i * 3, w: 4 + i % 3, d: 3 + i % 2 } }));
function parkLandscape() {
  const landscape = new THREE.Group(), lawn = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial());
  landscape.add(lawn);
  for (let i = 0; i < 5; i++) { const tree = new THREE.Group(); tree.position.set(-60 + i * 30, 0, -70); landscape.add(tree); }
  return landscape;
}
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
    [createTerrestrial, ['war-of-the-worlds', 'terminator-2', '2012', 'twister', 'dantes-peak', 'day-after-tomorrow', 'day-the-earth-stood-still', 'evangelion', 'deep-impact'],
      ['War of the Worlds — tripod invasion', 'Terminator 2 — nuclear firestorm', '2012 — continental rupture', 'Twister — F5 outbreak', "Dante's Peak — Plinian eruption",
        'The Day After Tomorrow — superstorm', 'The Day the Earth Stood Still — visitation', 'The End of Evangelion — Third Impact', 'Deep Impact — ocean strike'], 'city', 0],
    [createCosmic, ['interstellar', 'knowing', 'armageddon', 'gravity', 'wandering-earth'],
      ['interstellar-black-hole', 'knowing-solar-flare', 'armageddon-asteroid', 'gravity-debris-cascade', 'wandering-earth-jupiter-flyby'], 'space', 1]
  ]) {
    const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
    camera.position.set(122, 78, 155);
    const renderer = create({ scene, canvas, camera, buildings: cityBuildings(), landscape: parkLandscape() });
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
    const other = new THREE.Scene(), replay = create({ scene: other, canvas, camera, buildings: cityBuildings(), landscape: parkLandscape() });
    for (const id of [...ids].reverse()) replay.update(18, config(id, world));
    replay.updateView?.();
    for (const [i, id] of ids.entries()) {
      renderer.update(18, config(id, world)); renderer.updateView?.();
      replay.update(18, config(id, world)); replay.updateView?.();
      assert.equal(snapshot(scene.getObjectByName(names[i])), snapshot(other.getObjectByName(names[i])), 'seed does not depend on visit order');
    }
  }
});

test('the visitor swarm consumes the landscape trees as a function of time and restores them for other scenes', () => {
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
  const landscape = parkLandscape(), trees = landscape.children.slice(1);
  const renderer = createTerrestrial({ scene, canvas, camera, landscape });
  renderer.update(12, config('day-the-earth-stood-still', 'landscape'));
  assert.ok(trees.every(tree => tree.scale.x === 1), 'the park is intact while the sphere lands');
  renderer.update(29, config('day-the-earth-stood-still', 'landscape'));
  const eaten = trees.map(tree => tree.scale.x);
  assert.ok(eaten.every(scale => scale < .2), 'the swarm has consumed the trees by the end');
  renderer.update(12, config('day-the-earth-stood-still', 'landscape'));
  assert.ok(trees.every(tree => tree.scale.x === 1), 'reverse scrubbing regrows the trees');
  renderer.update(29, config('day-the-earth-stood-still', 'landscape'));
  assert.deepEqual(trees.map(tree => tree.scale.x), eaten, 'consumption is a function of time only');
  renderer.update(29, config('twister', 'landscape'));
  assert.ok(trees.every(tree => tree.scale.x === 1), 'leaving the scene restores the trees for the other landscape scenes');
});

test('the A.T. field mask follows the ULTRA asset ceiling, wakes the paused simulation and never changes geometry', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync, requested = [];
  THREE.TextureLoader.prototype.loadAsync = async function (url) {
    if (/\/at-field(?:-4k)?\.webp$/.test(url)) requested.push(url);
    if (url.includes('fail')) throw new Error('Injected texture failure');
    return new THREE.Texture();
  };
  try {
    for (const [ceiling, expected, resolution] of [['ultra', '/assets/at-field-4k.webp', '4096'], [undefined, '/assets/at-field.webp', '1024']]) {
      const scene = new THREE.Scene(), canvas = Object.assign(new EventTarget(), { dataset: { quality: 'balanced', pixelRatio: '1.25', ...(ceiling ? { qualityCeiling: ceiling } : {}) } });
      let wakeups = 0;
      canvas.addEventListener('at-field-ready', () => wakeups++);
      const renderer = createTerrestrial({ scene, canvas, buildings: cityBuildings(), landscape: parkLandscape() });
      renderer.update(14, config('evangelion'));
      assert.equal(requested.at(-1), expected);
      assert.equal(canvas.dataset.atFieldResolution, resolution);
      const group = scene.getObjectByName('The End of Evangelion — Third Impact'), before = snapshot(group);
      await new Promise(setImmediate);
      assert.equal(canvas.dataset.atFieldTexture, 'ready');
      assert.equal(wakeups, 1, 'a paused timeline is woken once the mask arrives');
      assert.ok(scene.getObjectByName('A.T. field').material.map, 'the loaded mask reaches the field material');
      assert.ok(scene.getObjectByName('A.T. field barrier').material.map, 'the barrier gets its own repeat of the same mask');
      renderer.update(14, config('evangelion'));
      assert.equal(snapshot(group), before, 'texture arrival does not change geometry');
    }
    // A failed download keeps the flat fallback plane and still wakes the simulation so its state is reported.
    const scene = new THREE.Scene(), canvas = Object.assign(new EventTarget(), { dataset: { quality: 'balanced', pixelRatio: '1.25', qualityCeiling: 'fail' } });
    let wakeups = 0;
    canvas.addEventListener('at-field-ready', () => wakeups++);
    THREE.TextureLoader.prototype.loadAsync = async function (url) {
      if (/\/at-field(?:-4k)?\.webp$/.test(url)) throw new Error('Injected texture failure');
      return new THREE.Texture();
    };
    const renderer = createTerrestrial({ scene, canvas, buildings: cityBuildings(), landscape: parkLandscape() });
    renderer.update(14, config('evangelion'));
    await new Promise(setImmediate);
    assert.equal(canvas.dataset.atFieldTexture, 'fallback');
    assert.equal(wakeups, 1);
    assert.equal(scene.getObjectByName('A.T. field').material.map, null);
    assert.equal(scene.getObjectByName('A.T. field').visible, true, 'the fallback plane still plays');
  } finally { THREE.TextureLoader.prototype.loadAsync = original; }
});

function productionWorld() {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#456789', .012); scene.environmentIntensity = .83;
  const city = new THREE.Group(), landscape = new THREE.Group(), ship = new THREE.Group(); scene.add(city, landscape, ship);
  const material = () => new THREE.MeshStandardMaterial({ color: '#789abc' });
  const mesh = geometry => new THREE.Mesh(geometry || new THREE.BoxGeometry(), material());
  const ground = mesh(), core = mesh(), tower = mesh(), blast = mesh(), wave = mesh(new THREE.PlaneGeometry(220, 75, 5, 5));
  const buildings = Array.from({ length: 15 }, (_, i) => { const b = mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0)); b.position.x = i * 8; b.scale.set(4, 20, 4); city.add(b); return b; });
  const baselineShip = mesh(); ship.add(baselineShip, core); city.add(ground, tower); landscape.add(mesh(new THREE.PlaneGeometry(200, 200)));
  const errors = [], camera = new THREE.PerspectiveCamera(), canvas = { dataset: { quality: 'balanced' } };
  return { scene, city, landscape, ship, buildings, ground, core, tower, blast, wave, camera, canvas,
    foam: mesh(new THREE.PlaneGeometry()), beam: mesh(), meteor: mesh(), tail: mesh(), baselineShip, errors,
    renderer: { capabilities: { getMaxAnisotropy: () => 1 } }, onAssetError: stage => errors.push(stage) };
}
function kit() {
  const scene = new THREE.Group();
  for (const name of ['Tower_A', 'Tower_B', 'Tower_C', 'Tower_D', 'Tower_E', 'Tree_A']) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 10, 10, 10), new THREE.MeshStandardMaterial({ color: '#6789ab' }));
    part.name = name; scene.add(part);
  }
  return { scene };
}
function proceduralTree() {
  const tree = new THREE.Group();
  const part = () => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const hiddenCone = part(); hiddenCone.visible = false;
  tree.add(part(), hiddenCone, part(), part());
  return tree;
}
async function withAssets(failures, run) {
  const original = [GLTFLoader.prototype.loadAsync, HDRLoader.prototype.loadAsync, THREE.TextureLoader.prototype.loadAsync];
  GLTFLoader.prototype.loadAsync = async function (url) {
    if (failures.some(value => url.includes(value))) throw new Error('Injected model failure');
    return url.includes('city-kit') ? kit() : { scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())) };
  };
  HDRLoader.prototype.loadAsync = async () => { throw new Error('Injected HDR failure'); };
  THREE.TextureLoader.prototype.loadAsync = async function (url) {
    if (failures.some(value => url.includes(value))) throw new Error('Injected texture failure');
    return new THREE.Texture();
  };
  try { await run(); } finally {
    [GLTFLoader.prototype.loadAsync, HDRLoader.prototype.loadAsync, THREE.TextureLoader.prototype.loadAsync] = original;
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

test('only HIGH shows the authored landscape tree; lower tiers keep the procedural crowns within the phone budget', async () => {
  await withAssets([], async () => {
    const world = productionWorld();
    const trees = Array.from({ length: 3 }, proceduralTree);
    world.landscape.add(...trees);
    const production = await createProduction(world);
    const authored = tree => tree.children.at(-1), crowns = tree => [tree.children[0], tree.children[2], tree.children[3]];
    assert.ok(trees.every(tree => tree.children.length === 5), 'each tree gained one authored clone');
    production.update(18, config('day-the-earth-stood-still', 'landscape'));
    for (const tree of trees) {
      assert.equal(authored(tree).visible, false, 'BALANCED hides the authored tree');
      assert.ok(crowns(tree).every(part => part.visible), 'BALANCED shows the procedural trunk and crowns');
      assert.equal(tree.children[1].visible, false, 'the retired cone stays hidden');
    }
    world.canvas.dataset.quality = 'high';
    production.update(18, config('day-the-earth-stood-still', 'landscape'));
    for (const tree of trees) {
      assert.equal(authored(tree).visible, true, 'HIGH shows the authored tree');
      assert.ok(crowns(tree).every(part => !part.visible), 'HIGH hides the procedural crowns');
    }
    world.canvas.dataset.quality = 'lite';
    production.update(18, config('day-the-earth-stood-still', 'landscape'));
    assert.ok(trees.every(tree => !authored(tree).visible && crowns(tree).every(part => part.visible)), 'LITE also keeps the procedural crowns');
  });
});

test('the superstorm glazes the authored facades and paves the streets with ice', async () => {
  await withAssets([], async () => {
    const world = productionWorld(), production = await createProduction(world);
    production.update(2, config('day-after-tomorrow'));
    const facades = world.city.children.filter(object => object.isInstancedMesh && object.visible).map(mesh => mesh.material);
    assert.ok(facades.length > 0);
    const before = facades.map(material => material.roughness);
    production.update(28, config('day-after-tomorrow'));
    facades.forEach((material, i) => assert.ok(material.roughness < before[i] * .6, 'frozen facades turn glossy'));
    production.update(2, config('day-after-tomorrow'));
    facades.forEach((material, i) => assert.equal(material.roughness, before[i], 'reverse scrubbing thaws the glaze'));
    production.update(28, config('terminator-2'));
    facades.forEach((material, i) => assert.equal(material.roughness, before[i], 'other city scenes keep the dry facades'));
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

test('Twister marches its funnel and wall cloud as volumes only at HIGH and above; lower tiers keep the mesh funnel', () => {
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
  const renderer = createTerrestrial({ scene, canvas, camera, landscape: parkLandscape() });
  const twister = () => renderer.update(18, config('twister', 'landscape'));
  const named = name => scene.getObjectByName('Twister — F5 outbreak').getObjectByName(name);
  twister();
  assert.equal(named('Condensation funnel').visible, true);
  assert.equal(named('Funnel volume').visible, false);
  assert.equal(named('Wall cloud volume').visible, false);
  assert.equal(named('Rotating wall cloud').visible, true);
  const balancedRain = named('Rain curtain').count;
  canvas.dataset.quality = 'high'; twister();
  assert.equal(named('Condensation funnel').visible, false);
  assert.equal(named('Funnel volume').visible, true);
  assert.equal(named('Wall cloud volume').visible, true);
  assert.equal(named('Rotating wall cloud').visible, false);
  assert.equal(named('Funnel volume').material.uniforms.steps.value, 32);
  assert.equal(named('Wall cloud volume').material.uniforms.steps.value, 14);
  assert.ok(named('Rain curtain').count > balancedRain, 'HIGH pours more rain');
  canvas.dataset.quality = 'ultra'; twister();
  assert.equal(named('Funnel volume').material.uniforms.steps.value, 48);
  assert.equal(named('Wall cloud volume').material.uniforms.steps.value, 18);
  // The march starts at the camera when it is inside a hull, so the hull flips to its back faces.
  camera.position.copy(named('Funnel volume').position).add(new THREE.Vector3(0, 50, 0)); renderer.updateView();
  assert.equal(named('Funnel volume').material.side, THREE.BackSide);
  camera.position.set(300, 300, 300); renderer.updateView();
  assert.equal(named('Funnel volume').material.side, THREE.FrontSide);
  canvas.dataset.quality = 'lite'; twister();
  assert.equal(named('Condensation funnel').visible, true);
  assert.equal(named('Funnel volume').visible, false);
  assert.ok(named('Rain curtain').count < balancedRain, 'LITE pours less rain');
});

test('Twister leans the landscape trees into the inflow as a function of time and restores them on leave', () => {
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'high', pixelRatio: '2' } }, camera = new THREE.PerspectiveCamera();
  const landscape = parkLandscape(), trees = landscape.children.slice(1);
  // The shared grass field is also a landscape child and must never be rotated around the world origin.
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(.09, 1.3, 3), new THREE.MeshStandardMaterial(), 4); landscape.add(grass);
  const renderer = createTerrestrial({ scene, canvas, camera, landscape });
  const upright = () => trees.every(tree => tree.rotation.x === 0 && tree.rotation.z === 0);
  renderer.update(2, config('twister', 'landscape'));
  assert.ok(upright(), 'the plain is calm before the storm builds');
  renderer.update(18, config('twister', 'landscape'));
  assert.ok(!upright(), 'trees bend toward the funnel while it is on the ground');
  assert.ok(grass.rotation.x === 0 && grass.rotation.z === 0, 'the grass field stays on the ground');
  const leaning = trees.map(tree => [tree.rotation.x, tree.rotation.z]);
  renderer.update(27, config('twister', 'landscape'));
  renderer.update(18, config('twister', 'landscape'));
  assert.deepEqual(trees.map(tree => [tree.rotation.x, tree.rotation.z]), leaning, 'the lean is a function of time only');
  renderer.update(12, config('day-the-earth-stood-still', 'landscape'));
  assert.ok(upright(), 'leaving the scene stands the trees back up for the other landscape scenes');
});

test('Deep Impact marches its entry trail, water column and crest spray only at HIGH and above', () => {
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
  const renderer = createTerrestrial({ scene, canvas, camera, buildings: cityBuildings(), landscape: parkLandscape() });
  const at = t => renderer.update(t, config('deep-impact'));
  const named = name => scene.getObjectByName('Deep Impact — ocean strike').getObjectByName(name);
  const volumes = ['Entry trail', 'Impact column', 'Crest spray'];
  at(8);
  for (const name of volumes) assert.equal(named(name).visible, false, `${name} stays hidden at BALANCED`);
  canvas.dataset.quality = 'high';
  at(8); assert.deepEqual(volumes.map(name => named(name).visible), [true, false, false], 'only the comet trail during the approach');
  at(15); assert.deepEqual(volumes.map(name => named(name).visible), [false, true, true], 'column and spray after the strike');
  at(27); assert.deepEqual(volumes.map(name => named(name).visible), [false, false, true], 'the column has fallen back by the inundation');
  assert.deepEqual(volumes.map(name => named(name).material.uniforms.steps.value), [24, 28, 18]);
  canvas.dataset.quality = 'ultra'; at(27);
  assert.deepEqual(volumes.map(name => named(name).material.uniforms.steps.value), [32, 40, 24]);
  const lip = named('Crest spray').material.uniforms.origin.value;
  assert.ok(lip.y > 60 && lip.z > 80, 'the lip rides high over the city by 27 s');
  camera.position.copy(lip); renderer.updateView();
  assert.equal(named('Crest spray').material.side, THREE.BackSide, 'a camera at the lip marches from inside the crest hull');
  camera.position.set(400, 300, 400); renderer.updateView();
  assert.equal(named('Crest spray').material.side, THREE.FrontSide);
});

test('Knowing marches its corona, ejection and engulfment only at HIGH and above', () => {
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
  const renderer = createCosmic({ scene, canvas, camera });
  const at = t => { renderer.update(t, config('knowing', 'space')); renderer.updateView(); };
  const named = name => scene.getObjectByName('knowing-solar-flare').getObjectByName(name);
  const volumes = ['Corona volume', 'Ejection volume', 'Engulf volume'];
  at(14);
  assert.deepEqual(volumes.map(name => named(name).visible), [false, false, false], 'BALANCED keeps the sprites');
  assert.equal(named('Solar corona').visible, true); assert.equal(named('Coronal mass ejection').visible, true);
  canvas.dataset.quality = 'high';
  at(3); assert.deepEqual(volumes.map(name => named(name).visible), [true, false, false], 'only the corona before the eruption');
  assert.equal(named('Solar corona').visible, false, 'the sprite corona yields to the volume');
  at(14); assert.deepEqual(volumes.map(name => named(name).visible), [true, true, false], 'the ejection is in flight');
  assert.equal(named('Coronal mass ejection').visible, false);
  at(25); assert.deepEqual(volumes.map(name => named(name).visible), [true, true, true], 'Earth is engulfed');
  assert.equal(named('Engulfed Earth').visible, false);
  assert.deepEqual(volumes.map(name => named(name).material.uniforms.steps.value), [20, 32, 24]);
  canvas.dataset.quality = 'ultra'; at(25);
  assert.deepEqual(volumes.map(name => named(name).material.uniforms.steps.value), [28, 40, 32]);
  camera.position.set(-35, 99, -8); renderer.updateView();
  assert.equal(named('Corona volume').material.side, THREE.BackSide, 'a camera inside the corona shell marches from itself');
  camera.position.set(300, 300, 300); renderer.updateView();
  assert.equal(named('Corona volume').material.side, THREE.FrontSide);
});

test('Knowing restores native photosphere radiance when dropping to LITE', () => {
  const scene = new THREE.Scene(), canvas = { dataset: { quality: 'balanced', pixelRatio: '1.25' } }, camera = new THREE.PerspectiveCamera();
  const renderer = createCosmic({ scene, canvas, camera });
  renderer.update(5, config('knowing', 'space'));
  let photosphere;
  scene.traverse(object => { if (object.material?.uniforms?.radiance) photosphere = object.material.uniforms.radiance; });
  assert.equal(photosphere.value, 1.35);
  for (const [quality, value] of [['lite',1],['high',1.35],['ultra',1.35],['lite',1]]) {
    canvas.dataset.quality = quality;
    renderer.update(5, config('knowing', 'space'));
    assert.equal(photosphere.value, value, quality);
  }
});
