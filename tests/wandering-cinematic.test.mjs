import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three/webgpu';
import { sceneConfigs } from '../dist/scene-config.js';

// Staging is opt-in; the regular suite always exercises the production factory.
const staged = process.env.WANDERING_CANDIDATE;
const { createCosmic } = await import(staged ? pathToFileURL(resolve(staged)).href : '../dist/cosmic.js');
const config = staged ? { ...sceneConfigs['wandering-earth'], ...(JSON.parse(await readFile(new URL('../work/scene-authoring/wandering-earth/integration.json', import.meta.url), 'utf8'))).sceneConfig } : sceneConfigs['wandering-earth'];

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), canvas = { dataset: { quality, pixelRatio: '1' } };
  const camera = new THREE.PerspectiveCamera(45, 1280 / 580, .1, 1600);
  camera.position.fromArray(config.camera); camera.lookAt(...config.target); camera.updateMatrixWorld(true);
  const cosmic = createCosmic({ scene, canvas, camera });
  const at = time => cosmic.update(time, { id: 'wandering-earth', ...config });
  at(0);
  return { scene, canvas, camera, cosmic, at, named: name => scene.getObjectByName(name) };
}
function pose(mesh, i = 0) {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
  return { position, rotation, scale };
}
function snapshot(root) {
  root.updateMatrixWorld(true);
  const state = [];
  root.traverse(object => state.push({ name: object.name, visible: object.visible, matrix: object.matrix.toArray(), count: object.count,
    instances: object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
    range: object.geometry?.drawRange, opacity: object.material?.opacity,
    uniforms: Object.fromEntries(Object.entries(object.material?.uniforms || {}).map(([key, uniform]) => [key, typeof uniform.value === 'number' ? uniform.value : uniform.value?.toArray?.() ?? null])) }));
  return structuredClone(state);
}

test('Wandering Earth retains separated engine clusters while thinning secondary effects', () => {
  const f = fixture(), counts = [];
  for (const quality of ['lite', 'balanced', 'high']) {
    f.canvas.dataset.quality = quality; f.at(17);
    const jets = f.named('Fusion engine plumes'), cores = f.named('Plume cores'), center = f.named('Frozen Earth').position;
    assert.equal(jets.count, cores.count);
    const directions = Array.from({ length: jets.count }, (_, i) => pose(jets, i).position.sub(center).normalize());
    const seeds = directions.slice(0, 6);
    const members = seeds.map(() => 0);
    for (const direction of directions) {
      const angles = seeds.map(seed => seed.angleTo(direction));
      const nearest = Math.min(...angles); assert.ok(nearest < .22, 'engines remain grouped instead of filling the cap');
      members[angles.indexOf(nearest)]++;
    }
    assert.ok(members.every(count => count >= 4), 'all six clusters survive the phone tier');
    for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) assert.ok(seeds[i].angleTo(seeds[j]) > .48, 'clusters leave visible angular gaps');
    assert.equal(jets.material.map.isDataTexture, true);
    const alpha = jets.material.map.image.data.filter((_, i) => i % 4 === 3);
    assert.ok(alpha.some(value => value > 0 && value < 200), 'exhaust has soft opacity falloff');
    counts.push([jets.count, f.named('Atmospheric siphon').geometry.drawRange.count]);
    let triangles = 0;
    f.named('wandering-earth-jupiter-flyby').traverseVisible(object => {
      if (object.isMesh) triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    });
    assert.ok(triangles < 150000, `${quality}: ${triangles} triangles`);
  }
  for (let i = 0; i < 2; i++) assert.ok(counts[0][i] < counts[1][i] && counts[1][i] < counts[2][i]);
});

test('the engine cue builds into one brief ignition and a distinct late escape', () => {
  const f = fixture(), earth = f.named('Frozen Earth'), ignition = f.named('Jupiter ignition'), surface = f.named('Jupiter storm bands');
  f.at(7); const quietLength = pose(f.named('Fusion engine plumes')).scale.y;
  f.at(17); assert.ok(pose(f.named('Fusion engine plumes')).scale.y > quietLength * 1.5, 'the 16-second engine cue has an expressive visible ramp');
  f.at(22); assert.equal(ignition.visible, false); const capturedPosition = earth.position.clone();
  f.at(22.7); assert.equal(ignition.visible, true); assert.ok(surface.material.uniforms.flash.value > .25);
  f.at(24); assert.ok(surface.material.uniforms.flash.value < .3, 'the warm peak is already receding');
  f.at(25.5); assert.equal(ignition.visible, false); assert.equal(surface.material.uniforms.flash.value, 0); assert.equal(earth.position.distanceTo(capturedPosition), 0, 'escape waits for its existing audio cue');
  f.at(27); assert.equal(f.named('Ignition pressure wave').visible, false); assert.equal(f.named('Atmospheric siphon').material.uniforms.phase.value, 0);
  const midway = earth.position.clone(); f.at(30);
  assert.ok(earth.position.distanceTo(capturedPosition) > 50, 'Earth decisively escapes after the ignition clears');
  assert.ok(earth.position.distanceTo(midway) > 25, 'escape continues through the final beat');
  assert.equal(f.named('Frozen crust').material.uniforms.frost.value, 1);
  assert.equal(f.named('Frozen crust').material.uniforms.heat.value, 0);
});

test('the ignition is a shallow attached flare rather than a separate spherical body', () => {
  const f = fixture(); f.at(23);
  const flare = f.named('Jupiter ignition'), jupiter = f.named('Jupiter');
  const radius = f.named('Jupiter storm bands').geometry.parameters.radius;
  const centerDistance = flare.position.distanceTo(jupiter.position);
  assert.ok(flare.scale.x > flare.scale.y * 3, 'the ignition stretches across the cloud deck');
  assert.ok(flare.scale.z < flare.scale.y, 'the flare has shallow depth');
  assert.ok(centerDistance < radius, 'its center is buried in the gas giant');
  assert.ok(centerDistance + flare.scale.z > radius, 'the bright cap protrudes above the cloud deck at the peak');
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(flare.quaternion);
  const outward = flare.position.clone().sub(jupiter.position).normalize();
  assert.ok(normal.dot(outward) > .999, 'the flattened flare lies tangential to Jupiter');
  assert.equal(flare.material.blending, THREE.AdditiveBlending, 'dark fire mottles do not become an opaque third planet');
});

test('phone tiers give each clustered core more readable width and light', () => {
  const f = fixture(), widths = [], opacities = [], counts = [];
  for (const quality of ['high', 'balanced', 'lite']) {
    f.canvas.dataset.quality = quality; f.at(17);
    const cores = f.named('Plume cores');
    widths.push(pose(cores).scale.x); opacities.push(cores.material.opacity); counts.push(cores.count);
  }
  assert.ok(widths[1] > widths[0] * 1.25 && widths[2] > widths[1], 'reduced density retains substantial soft cores');
  assert.ok(opacities[1] > opacities[0] && opacities[2] > opacities[1]);
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2], 'visibility compensation preserves lower tier draw counts');
});

test('the complete frozen planet stays framed on desktop and narrow phone views', () => {
  const f = fixture();
  for (const [width, height, fov] of [[1280, 580, 45], [390, 380, 66]]) {
    const camera = new THREE.PerspectiveCamera(fov, width / height, .1, 1600);
    camera.position.fromArray(config.camera); camera.lookAt(...config.target); camera.updateMatrixWorld(true);
    for (const time of [0, 16, 23, 27, 30]) {
      f.at(time); f.scene.updateMatrixWorld(true);
      const surface = f.named('Frozen atmosphere'), positions = surface.geometry.attributes.position, corners = [];
      for (let i = 0; i < positions.count; i++) corners.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(surface.matrixWorld).project(camera));
      assert.ok(corners.every(point => Math.abs(point.x) < .86 && Math.abs(point.y) < .86), `Earth remains fully inside ${width}px canvas at ${time}s`);
      const projectedHeight = (Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y))) * height / 2;
      assert.ok(projectedHeight > 70, `the frozen foreground world has readable scale at ${width}px`);
    }
  }
});

test('paused orbit reorients the exhaust without advancing scene state', () => {
  const f = fixture(); f.at(17);
  const jets = f.named('Fusion engine plumes'), before = pose(jets), earth = f.named('Frozen Earth').position.clone();
  const time = f.named('Jupiter storm bands').material.uniforms.time.value;
  f.camera.position.set(-135, 95, 95); f.camera.lookAt(...config.target); f.camera.updateMatrixWorld(true); f.cosmic.updateView();
  const after = pose(jets);
  assert.ok(before.position.distanceTo(after.position) < .00001);
  assert.ok(before.rotation.angleTo(after.rotation) > .1, 'billboards face the changed camera while paused');
  assert.deepEqual(f.named('Frozen Earth').position, earth);
  assert.equal(f.named('Jupiter storm bands').material.uniforms.time.value, time);
});

test('Wandering Earth restores exact state after reverse seeks, tier changes and scene switches', () => {
  const f = fixture(), root = f.named('wandering-earth-jupiter-flyby');
  for (const quality of ['lite', 'balanced', 'high']) for (const time of [0, 7, 16, 21, 22.7, 24, 25.5, 27, 30]) {
    f.canvas.dataset.quality = quality; f.at(time); const before = snapshot(root);
    f.canvas.dataset.quality = 'high'; f.at(29);
    f.cosmic.update(18, { id: 'interstellar', ...sceneConfigs.interstellar }); assert.equal(root.visible, false);
    f.canvas.dataset.quality = quality; f.at(time);
    assert.deepEqual(snapshot(root), before, `restore ${quality} at ${time}`);
  }
});
