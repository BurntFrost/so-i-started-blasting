import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';

let createTerrestrial;
if (process.env.VISITATION_CANDIDATE) {
  const moduleURL = new URL('../dist/terrestrial.js', import.meta.url);
  let source = await readFile(moduleURL, 'utf8');
  const candidate = await readFile(process.env.VISITATION_CANDIDATE, 'utf8');
  const start = source.indexOf('  function createVisitation() {'), end = source.indexOf('  function createInstrumentality()', start);
  source = source.slice(0, start) + candidate + source.slice(end);
  source = source.replace(/from '([^']+)'/g, (_, name) => `from '${name.startsWith('.') ? new URL(name, moduleURL).href : import.meta.resolve(name)}'`);
  ({ createTerrestrial } = await import(`data:text/javascript,${encodeURIComponent(source)}`));
} else ({ createTerrestrial } = await import('../dist/terrestrial.js'));

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), canvas = { dataset: { quality, pixelRatio: '1' }, dispatchEvent() {} };
  const landscape = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const tree = new THREE.Group(); tree.position.set(-80 + i * 35, 0, -80); tree.scale.set(1 + i * .1, 1.2, .9); landscape.add(tree);
  }
  const manager = createTerrestrial({ scene, canvas, camera: new THREE.PerspectiveCamera(), landscape });
  const at = time => manager.update(time, { id: 'day-the-earth-stood-still', world: 'landscape' });
  at(0);
  return { scene, landscape, manager, at, named: name => scene.getObjectByName(name) };
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const result = [];
  root.traverse(object => result.push({ name: object.name, visible: object.visible, matrix: object.matrix.toArray(),
    count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
    opacity: object.material?.opacity, depthWrite: object.material?.depthWrite, intensity: object.intensity,
    uniforms: object.material?.uniforms ? Object.fromEntries(Object.entries(object.material.uniforms).filter(([, u]) => typeof u.value === 'number').map(([k, u]) => [k, u.value])) : null }));
  return result;
}

function positionAt(mesh, i) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix);
}

test('visitation keeps the full sculptural sentinel through emergence and dissolves without shrinking', () => {
  const f = fixture(), gort = f.named('GORT'), torso = f.named('GORT continuous torso'), nanites = f.named('Directional nanite ribbons');
  f.at(9); assert.equal(gort.visible, false); assert.equal(nanites.visible, false);
  f.at(18); assert.equal(gort.visible, true); assert.equal(torso.geometry.type, 'LatheGeometry');
  assert.ok(gort.scale.y >= 1.6, 'sentinel stands prominently beside the sphere');
  const scale = gort.scale.toArray(), position = gort.position.toArray();
  f.at(21); assert.deepEqual(gort.scale.toArray(), scale); assert.deepEqual(gort.position.toArray(), position);
  assert.ok(torso.material.opacity > .1 && torso.material.opacity < .9, 'full-size shell dissolves into the emerging swarm');
  f.at(24); assert.equal(gort.visible, false); assert.equal(nanites.visible, true);
});

test('nanite ribbons preserve separate destinations and continue across the aftermath on each tier', () => {
  for (const [quality, count] of [['lite', 900], ['balanced', 1600], ['high', 2400]]) {
    const f = fixture(quality), mesh = f.named('Directional nanite ribbons');
    f.at(22); const before = Array.from({length: mesh.count}, (_, i) => positionAt(mesh,i));
    f.at(30); const after = Array.from({length: mesh.count}, (_, i) => positionAt(mesh,i));
    assert.equal(mesh.count, count);
    const averageTravel = after.reduce((sum, p, i) => sum + p.distanceTo(before[i]), 0) / count;
    assert.ok(averageTravel > 45, 'the swarm advances throughout the aftermath');
    assert.ok(after.some(p => p.x < -65 && p.z > 40), 'leading ribbon crosses the foreground');
    assert.ok(after.some(p => p.x < -65 && p.z < -65), 'left branch reaches the trees');
    assert.ok(after.some(p => p.x > 65 && p.z < -80), 'right branch reaches a distinct grove');
    assert.ok(after.some(p => p.x > -15 && p.x < 30 && p.z > 0 && p.z < 35), 'trailing nanites keep the ribbons continuous rather than collapsing into endpoint balls');
  }
});

test('visitation exactly reverses all transforms, visible nanites, lights and tree consumption', () => {
  for (const quality of ['lite','balanced','high']) {
    const f = fixture(quality), root = f.named('The Day the Earth Stood Still — visitation');
    f.at(18); const first = snapshot(root), trees = f.landscape.children.map(tree => tree.scale.toArray());
    f.at(28); assert.notDeepEqual(snapshot(root), first);
    f.at(18); assert.deepEqual(snapshot(root), first); assert.deepEqual(f.landscape.children.map(tree => tree.scale.toArray()), trees);
    f.at(22); const release = snapshot(root); f.at(30); f.at(22); assert.deepEqual(snapshot(root), release);
    for (const time of [0,6,9,14.5,18,22,27,30]) {
      f.at(time); root.traverse(object => {
        if (object.instanceMatrix) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
        if (object.geometry) assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
      });
    }
  }
});

test('visitation restores exact shared tree scale on switch-out and preserves initial scale on re-entry', () => {
  const f = fixture(), initial = f.landscape.children.map(tree => tree.scale.toArray());
  f.at(30); assert.notDeepEqual(f.landscape.children.map(tree => tree.scale.toArray()), initial);
  f.manager.update(0, { id:'independence-day', world:'city' });
  assert.deepEqual(f.landscape.children.map(tree => tree.scale.toArray()), initial);
  f.at(0); assert.deepEqual(f.landscape.children.map(tree => tree.scale.toArray()), initial);
});


test('physical sentinel and sphere retain depth and grounding through the cinematic effect classifier', () => {
  const f = fixture(), gort = f.named('GORT'), torso = f.named('GORT continuous torso'), orb = f.named('Luminous sphere');
  f.at(18);
  assert.equal(orb.userData.opaqueDepth, true);
  assert.equal(orb.layers.isEnabled(1), false, 'the sphere occludes terrain AO instead of receiving the distant horizon line');
  assert.equal(torso.material.alphaHash, true);
  assert.equal(torso.material.transparent, false);
  assert.equal(torso.layers.isEnabled(1), false);
  assert.equal(torso.castShadow, true);
  const x = gort.position.x, z = gort.position.z;
  const terrain = -.5 + (Math.sin(x*.022)*Math.cos(z*.027)*5-Math.sin(z*.06)*1.5)*Math.max(0,Math.min(1,(Math.hypot(x,z)-25)/80));
  assert.ok(Math.abs(gort.position.y - terrain) < .000001, 'the stance follows the actual meadow height');
});
