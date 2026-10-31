import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';

const candidate = process.env.IMPACT_CANDIDATE;
const moduleURL = new URL('../dist/terrestrial.js', import.meta.url);
let source = await readFile(moduleURL, 'utf8');
let productionSource = await readFile(new URL('../dist/production.js', import.meta.url), 'utf8');
if (candidate) {
  const factory = await readFile(candidate, 'utf8');
  const start = source.indexOf('  function createTsunami() {'), end = source.indexOf('  const factories =', start);
  source = source.slice(0, start) + factory + source.slice(end);
  const integration = JSON.parse(await readFile(new URL('../work/scene-authoring/deep-impact/integration.json', import.meta.url), 'utf8'));
  for (const { file, old, new: replacement } of integration.replacements) {
    if (file === 'dist/terrestrial.js') {
      if (source.includes(old)) source = source.replace(old, replacement);
      else assert.ok(source.includes(replacement), `${file}: staged patch has a current integration anchor`);
    }
    if (file === 'dist/production.js') {
      if (productionSource.includes(old)) productionSource = productionSource.replace(old, replacement);
      else assert.ok(productionSource.includes(replacement), `${file}: staged patch has a current integration anchor`);
    }
  }
}
source = source.replace(/from '([^']+)'/g, (_, name) => `from '${name.startsWith('.') ? new URL(name, moduleURL).href : import.meta.resolve(name)}'`);
const { createTerrestrial } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const profileStart = productionSource.search(/const waveProfile\s*=/), profileEnd = productionSource.indexOf('  const freezeColor', profileStart);
const waveProfile = new Function('smooth', productionSource.slice(profileStart, profileEnd) + ';return waveProfile;')(smooth);

function fixture(quality = 'high', { atlasRequest, refreshOnWake = false } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  let currentTime = 0;
  const events = [];
  const canvas = { dataset: { quality, pixelRatio: '1' }, dispatchEvent(event) {
    events.push(event.type);
    if (refreshOnWake && event.type === 'explosion-ready') at(currentTime);
  } };
  const ground = new THREE.Mesh(new THREE.BoxGeometry(170, 2, 155), new THREE.MeshStandardMaterial({ color: '#647077', roughness: .75, metalness: .15 }));
  ground.position.y = -2; scene.add(ground);
  const manager = createTerrestrial({ scene, canvas, camera, ground });
  const at = time => { currentTime = time; manager.update(time, { id: 'deep-impact', world: 'city' }); manager.updateView(); };
  const originalLoad = THREE.TextureLoader.prototype.loadAsync;
  if (atlasRequest) THREE.TextureLoader.prototype.loadAsync = atlasRequest;
  try { at(0); } finally { THREE.TextureLoader.prototype.loadAsync = originalLoad; }
  return { scene, camera, canvas, manager, ground, at, events, named: name => scene.getObjectByName(name) };
}
function snapshot(root) {
  root.updateMatrixWorld(true);
  const values = [];
  root.traverse(object => values.push({ name: object.name, visible: object.visible, matrix: object.matrix.toArray(), count: object.count,
    instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
    opacity: object.material?.opacity,
    uniforms: object.material?.uniforms ? Object.fromEntries(Object.entries(object.material.uniforms).filter(([, u]) => typeof u.value === 'number' || u.value?.isVector3).map(([key, u]) => [key, typeof u.value === 'number' ? u.value : u.value.toArray()])) : null }));
  return values;
}
function positionAt(mesh, i) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix);
}

test('coast continues past the city on three sides and has an irregular ocean-facing shore', () => {
  const f = fixture(), coast = f.named('Continuous Atlantic coastline');
  assert.ok(coast);
  assert.equal(coast.material, f.ground.material, 'coast and city use the same asphalt material and asynchronous texture updates');
  assert.ok(coast.geometry.attributes.normal.getY(0) > .99, 'coast winding faces upward with the shared front-side material');
  coast.geometry.computeBoundingBox();
  assert.ok(coast.geometry.boundingBox.min.x < -900 && coast.geometry.boundingBox.max.x > 900);
  assert.ok(coast.geometry.boundingBox.max.z > 800);
  const positions = coast.geometry.attributes.position, shore = [];
  for (let i = 0; i < positions.count; i++) if (positions.getZ(i) < 0) shore.push(positions.getZ(i));
  assert.ok(Math.max(...shore) - Math.min(...shore) > 10, 'shoreline is visibly curved rather than the former square city pad');
  assert.ok(shore.every(z => z < -88), 'the shore lies beyond the back row of city buildings');
  assert.equal(coast.material.transparent, false);
  assert.equal(coast.layers.isEnabled(1), false, 'the coast retains physical depth under HIGH AO');
});

test('wave crest overhangs and turns down with asymmetric ridges instead of a vertical curtain', () => {
  for (const time of [20,23,27,30]) {
    const shoulder = waveProfile(.76, 60, 0, time), lip = waveProfile(1, 60, 0, time);
    assert.ok(lip.y < shoulder.y - 5, 'the lip folds below the wave shoulder');
    assert.ok(lip.z > shoulder.z + 5, 'the lip projects toward the city');
  }
  const heights = [-150,-80,0,60,140].map(x => waveProfile(.76, 60, x, 23).y);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 5, 'the silhouette has long uneven ridges');
  for (const time of [0,14,20,25,30]) for (const x of [-181,0,181]) {
    assert.deepEqual(waveProfile(0, 60, x, time), { y: 0, z: 0 }, 'the water foot stays anchored to its traveling base');
  }
});

test('impact stays short and broad while every tier retains readable crest detail', () => {
  for (const [quality, foamCount, dropCount] of [['lite',18,60],['balanced',28,130],['high',42,240]]) {
    const f = fixture(quality), froth = f.named('Broken crest foam'), droplets = f.named('Wind-torn crest droplets');
    f.at(12); assert.equal(froth.visible, false);
    f.at(17);
    assert.equal(froth.count, foamCount); assert.equal(droplets.count, dropCount);
    assert.equal(f.named('Impact column'), undefined, 'the clipped cylindrical volume is removed');
    assert.equal(f.named('Crest spray'), undefined, 'crest mist has no box hull to clip into a slab');
    const vapor = f.named('Soft impact vapor 0');
    assert.equal(vapor.geometry.type, 'PlaneGeometry');
    assert.equal(vapor.material.depthWrite, false);
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    for (let i = 0; i < froth.count; i++) { froth.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix); assert.ok(scale.x < 1.2 && scale.y < .35, 'solid foam remains fine instead of marshmallow-sized'); }
    f.at(23); assert.equal(vapor.visible, false); assert.equal(f.named('Impact vapor fallback').visible, false);
    const positions = Array.from({ length: droplets.count }, (_, i) => positionAt(droplets, i));
    assert.ok(new Set(positions.map(p => p.y.toFixed(2))).size > droplets.count * .9, 'droplets do not repeat in level rows');
    const before = positionAt(droplets, 10); f.at(23.35);
    assert.ok(positionAt(droplets, 10).distanceTo(before) > 1, 'spray continues moving between still captures');
  }
});

test('crest mist tracks the moving folded wave and updates while orbiting a paused shot', () => {
  const f = fixture(), mesh = f.named('Windblown crest mist 0');
  for (const time of [15,20,23,27,30]) {
    f.at(time);
    const travel = smooth((time - 14) / 16), height = (22 + travel * 60) * (1 - .38 * smooth((time - 25) / 5));
    for (let i = 0; i < mesh.count; i++) {
      const point = positionAt(mesh, i), lip = waveProfile(1, height, point.x, time);
      assert.ok(Math.abs(point.y - (-1.2 + lip.y)) < 15, 'soft mist stays near the actual uneven lip');
      assert.ok(Math.abs(point.z - (-115 + travel * 230 + lip.z)) < 12);
    }
  }
  const before = mesh.instanceMatrix.array.slice();
  f.camera.position.set(180, 80, 130); f.camera.lookAt(0, 35, -30); f.manager.updateView();
  assert.notDeepEqual(mesh.instanceMatrix.array, before, 'billboards turn toward the camera while paused');
});

test('foam, volumes and vapor exactly reverse and remain finite on all numeric detail tiers', () => {
  for (const quality of ['lite','balanced','high']) {
    const f = fixture(quality), root = f.named('Deep Impact — ocean strike');
    for (const time of [0,12.5,13.5,16,20,23,27,30]) {
      f.at(time); const expected = snapshot(root);
      f.at(time < 20 ? 29 : 6); f.at(time);
      assert.deepEqual(snapshot(root), expected);
      root.traverse(object => {
        if (object.instanceMatrix) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
        if (object.geometry) assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
      });
    }
  }
});

test('switching out hides the coast and re-entry restores the exact active shot', () => {
  const f = fixture(), root = f.named('Deep Impact — ocean strike');
  f.at(23); const expected = snapshot(root);
  f.manager.update(6, { id: 'independence-day', world: 'city' });
  assert.equal(root.visible, false);
  f.at(23); assert.deepEqual(snapshot(root), expected);
  let triangles = 0;
  root.traverseVisible(object => {
    if (object.geometry && !object.isPoints) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
  });
  assert.ok(triangles < 20000, `owned HIGH scene details stay compact (${triangles} triangles); full phone budget is measured in browser`);
});


test('a delayed atlas load replaces the paused fallback and billboards still follow a paused orbit', async () => {
  let resolveAtlas;
  const atlas = new Promise(resolve => { resolveAtlas = resolve; });
  const f = fixture('high', { atlasRequest: () => atlas, refreshOnWake: true });
  f.at(17);
  const vapor = f.named('Soft impact vapor 0'), fallback = f.named('Impact vapor fallback');
  assert.equal(f.canvas.dataset.impactMist, 'loading');
  assert.equal(vapor.visible, false); assert.equal(fallback.visible, true);
  const texture = new THREE.Texture(); resolveAtlas(texture);
  await atlas; await Promise.resolve();
  assert.equal(f.canvas.dataset.impactMist, 'ready');
  assert.deepEqual(f.events, ['explosion-ready'], 'completion uses the wake event that reruns paused world state');
  assert.equal(vapor.visible, true); assert.equal(fallback.visible, false);
  assert.equal(vapor.material.alphaMap, texture);
  const position = positionAt(vapor, 0), before = vapor.instanceMatrix.array.slice();
  f.camera.position.set(170, 60, 145); f.camera.lookAt(-30, 35, -90); f.manager.updateView();
  assert.notDeepEqual(vapor.instanceMatrix.array, before);
  assert.ok(positionAt(vapor, 0).distanceTo(position) < 1e-6, 'orbit changes facing, without advancing the paused vapor');
});

test('a failed atlas request settles readiness and keeps the paused fallback usable', async () => {
  let rejectAtlas;
  const atlas = new Promise((_, reject) => { rejectAtlas = reject; });
  const f = fixture('balanced', { atlasRequest: () => atlas, refreshOnWake: true });
  f.at(17);
  rejectAtlas(new Error('Forced particle atlas failure'));
  await atlas.catch(() => {}); await Promise.resolve();
  assert.equal(f.canvas.dataset.impactMist, 'fallback');
  assert.deepEqual(f.events, ['explosion-ready']);
  assert.equal(f.named('Impact vapor fallback').visible, true);
  assert.equal(f.named('Soft impact vapor 0').visible, false);
  const root = f.named('Deep Impact — ocean strike'), expected = snapshot(root);
  f.at(29); f.at(17); assert.deepEqual(snapshot(root), expected);
  f.camera.position.set(80, 45, 140); f.camera.lookAt(-20, 35, -100);
  assert.doesNotThrow(() => f.manager.updateView());
});
