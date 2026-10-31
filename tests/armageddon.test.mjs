import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createCosmic } from '../dist/cosmic.js';
import { sceneConfigs } from '../dist/scene-config.js';
import { armageddonFragments, armageddonSeam } from '../dist/armageddon-geometry.js';

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), canvas = { dataset: { quality, pixelRatio: '1' } };
  const camera = new THREE.PerspectiveCamera(); camera.position.set(...sceneConfigs.armageddon.camera);
  const cosmic = createCosmic({ scene, canvas, camera });
  const at = time => cosmic.update(time, { id: 'armageddon', ...sceneConfigs.armageddon });
  at(0);
  return { scene, canvas, cosmic, at, named: name => scene.getObjectByName(name) };
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const result = [];
  root.traverse(object => {
    const materials = [].concat(object.material || []);
    result.push({ name: object.name, matrix: object.matrix.toArray(), visible: object.visible,
      count: object.count, instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
      points: object.isPoints ? Array.from(object.geometry.attributes.position.array.slice(0, object.geometry.drawRange.count * 3)) : null,
      materials: materials.map(material => ({ opacity: material.opacity, emissive: material.emissiveIntensity,
        color: material.color?.toArray(),
        fade: material.uniforms?.fade?.value, time: material.uniforms?.time?.value,
        phase: material.uniforms?.phase?.value })) });
  });
  return result;
}

test('authored asteroid halves include closed shell/cut groups within the geometry budget', () => {
  assert.deepEqual(armageddonFragments.map(piece => piece.name), ['Asteroid_Left', 'Asteroid_Right']);
  let triangles = 0;
  for (const piece of armageddonFragments) {
    assert.equal(piece.positions.length % 9, 0);
    assert.equal(piece.normals.length, piece.positions.length);
    assert.ok([...piece.pivot, ...piece.positions, ...piece.normals].every(Number.isFinite));
    assert.deepEqual(piece.groups.map(group => group.materialIndex), [0, 1]);
    assert.equal(piece.groups[0].start, 0);
    assert.equal(piece.groups[1].start, piece.groups[0].count);
    assert.equal(piece.groups.reduce((sum, group) => sum + group.count, 0), piece.positions.length / 3);
    triangles += piece.positions.length / 9;
    // A closed shell has each undirected edge exactly twice, including its fracture cap.
    const edges = new Map(), vertex = index => piece.positions.slice(index, index + 3).join(',');
    for (let i = 0; i < piece.positions.length; i += 9) {
      const vertices = [vertex(i), vertex(i + 3), vertex(i + 6)];
      for (let edge = 0; edge < 3; edge++) {
        const key = [vertices[edge], vertices[(edge + 1) % 3]].sort().join('|');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok([...edges.values()].every(count => count === 2), `${piece.name} is watertight`);
  }
  assert.ok(triangles < 12000);
  assert.ok(armageddonSeam.length > 9 && armageddonSeam.length % 3 === 0);
  assert.ok(armageddonSeam.every(Number.isFinite));
});

test('the main asteroid pieces preserve their mass and separate after the existing detonation', () => {
  const f = fixture(), halves = armageddonFragments.map(piece => f.named(piece.name));
  f.at(6);
  for (const [index, half] of halves.entries()) assert.deepEqual(half.position.toArray(), armageddonFragments[index].pivot);
  const together = halves[0].position.distanceTo(halves[1].position);
  f.at(16);
  assert.equal(halves[0].position.distanceTo(halves[1].position), together);
  f.at(18);
  const opening = halves[0].position.distanceTo(halves[1].position);
  assert.ok(opening > together + 5, 'the split is readable by the first post-blast capture');
  assert.ok(halves[0].material[1].emissiveIntensity > .1, 'the exposed core retains restrained warmth after the flash');
  f.at(24);
  assert.ok(halves[0].position.distanceTo(halves[1].position) > opening + 35);
  for (const half of halves) {
    assert.equal(half.visible, true);
    assert.deepEqual(half.scale.toArray(), [1, 1, 1], 'neither major half shrinks away');
  }
  assert.equal(f.named('Core detonation').visible, false, 'the flash does not conceal the departing pieces');
  assert.ok(halves[0].material[1].emissiveIntensity <= .02, 'the aftermath reveals cooled stone instead of a glowing flat cap');
});

test('the cinematic breakup has a brief impulse and asymmetric motion that continues into the aftermath', () => {
  const f = fixture(), left = f.named('Asteroid_Left'), right = f.named('Asteroid_Right');
  f.at(16.3);
  assert.equal(f.named('Core detonation').visible, true);
  assert.ok(f.named('Core detonation').material.uniforms.fade.value > .5);
  const hot = left.material[1].emissiveIntensity;
  f.at(17.1);
  assert.equal(f.named('Core detonation').visible, false, 'glare recedes within roughly one second');
  f.at(18);
  assert.ok(left.material[1].emissiveIntensity < hot / 2);
  f.at(24);
  const before = [left.position.clone(), right.position.clone()];
  const rotations = [left.rotation.toArray(), right.rotation.toArray()];
  f.at(28);
  const movement = [left.position.distanceTo(before[0]), right.position.distanceTo(before[1])];
  assert.ok(movement.every(distance => distance > 5), 'both halves keep coasting after the hero frame');
  assert.ok(Math.abs(movement[0] - movement[1]) > 1, 'the two trajectories have distinct weight and depth');
  assert.notDeepEqual(left.rotation.toArray(), rotations[0]);
  assert.notDeepEqual(right.rotation.toArray(), rotations[1]);
  assert.equal(f.named('Asteroid fracture dust').material.opacity, 0, 'the trails settle without an abrupt visible cutoff');
});

test('the depth-tested fracture warning builds before detonation and fades away after opening', () => {
  const f = fixture(), seam = f.named('Core fracture seam'), glow = f.named('Fracture seam glow');
  const signal = () => seam.material.color.r * seam.material.opacity;
  f.at(6);
  assert.equal(seam.visible, false);
  assert.equal(signal(), 0);
  assert.equal(glow.material.opacity, 0);
  f.at(10);
  const early = signal();
  assert.equal(seam.visible, true);
  assert.ok(early > 0);
  f.at(15);
  assert.ok(signal() > early * 3, 'the warning becomes clearly stronger near detonation');
  assert.ok(glow.material.opacity > 0);
  assert.equal(seam.material.depthTest, true, 'the warning cannot show through the back of the asteroid');
  assert.equal(glow.material.depthTest, true);
  f.at(18);
  assert.equal(seam.visible, false);
  assert.equal(signal(), 0);
  assert.equal(glow.material.opacity, 0);
});

test('both major fragments survive every quality tier while secondary ejecta are reduced', () => {
  const f = fixture(), counts = [];
  for (const quality of ['lite', 'balanced', 'high', 'ultra']) {
    f.canvas.dataset.quality = quality; f.at(24);
    for (const piece of armageddonFragments) assert.equal(f.named(piece.name).visible, true, quality);
    counts.push(f.named('Secondary asteroid ejecta').count);
  }
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
  assert.equal(counts[2], counts[3]);
});

test('Armageddon poses, glow and debris reverse exactly across time, detail and scene switches', () => {
  const f = fixture(), root = f.named('armageddon-asteroid');
  for (const time of [6, 15, 16.5, 18, 24, 28]) {
    f.canvas.dataset.quality = 'balanced'; f.at(time);
    const before = snapshot(root);
    f.canvas.dataset.quality = 'high'; f.at(29);
    f.cosmic.update(12, { id: 'interstellar', ...sceneConfigs.interstellar });
    assert.equal(root.visible, false);
    f.canvas.dataset.quality = 'balanced'; f.at(time);
    assert.deepEqual(snapshot(root), before, `restore t=${time}`);
  }
});
