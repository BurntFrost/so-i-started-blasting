import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createTerrestrial } from '../dist/terrestrial.js';
import { sceneConfigs } from '../dist/scene-config.js';

function fixture(quality = 'high') {
  const scene = new THREE.Scene(), canvas = { dataset: { quality, pixelRatio: '1' } };
  const buildings = [-65, -30, 5, 40, 75].map(x => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.userData = { x, z: 15, w: 5, h: 24, d: 6 };
    mesh.position.set(x, -1, 15); mesh.scale.set(5, 24, 6);
    return mesh;
  });
  const camera = new THREE.PerspectiveCamera();
  const terrestrial = createTerrestrial({ scene, canvas, camera, buildings });
  const at = time => terrestrial.update(time, { id: 'day-after-tomorrow', ...sceneConfigs['day-after-tomorrow'] });
  at(0);
  return { scene, canvas, buildings, terrestrial, at, named: name => scene.getObjectByName(name) };
}

function snapshot(root) {
  root.updateMatrixWorld(true);
  const values = [];
  root.traverse(object => {
    values.push(object.name, object.visible, object.matrix.toArray(), object.count,
      // Only count instances are submitted; unused capacity may retain a higher tier's last pose.
      object.instanceMatrix ? Array.from(object.instanceMatrix.array.slice(0, object.count * 16)) : null,
      object.geometry?.drawRange,
      object.material?.opacity, object.material?.uniforms?.time?.value);
  });
  return structuredClone(values);
}

test('the blizzard crosses the city and settles into a less obscured aftermath', () => {
  const f = fixture(), front = f.named('Directional snow front');
  f.at(8); const approach = front.position.x;
  f.at(16); const crossing = front.position.x, peak = front.geometry.drawRange.count;
  assert.ok(f.named('Wind-driven snow streaks').material.opacity > .4, 'directional streaks emphasize the middle gust');
  f.at(29);
  assert.ok(crossing > approach + 100, 'the dense weather moves across the skyline');
  assert.ok(front.position.x > crossing + 150, 'the front keeps leaving the view');
  assert.ok(front.geometry.drawRange.count < peak * .15, 'late flurries do not sustain a whiteout');
  assert.ok(f.named('Frozen streets').material.opacity > .6, 'established ice remains after the snow settles');
  assert.equal(f.named('Wind-driven snow streaks').visible, false, 'speed streaks clear for the frozen aftermath');
});

test('roof and corner frost advance windward first and retreat exactly when seeking back', () => {
  const f = fixture(), roofs = f.named('Windward roof frost'), corners = f.named('Descending facade ice');
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
  const height = (mesh, index) => { mesh.getMatrixAt(index, matrix); return scale.setFromMatrixScale(matrix).y; };
  f.at(14);
  assert.ok(height(roofs, 0) > .1, 'windward roofs have accumulated frost');
  assert.ok(height(roofs, 4) < .01, 'leeward roofs have not frozen prematurely');
  assert.ok(height(corners, 0) > 5 && height(corners, 8) < .01, 'ice follows the same front down facade corners');
  const before = snapshot(f.named('The Day After Tomorrow — superstorm'));
  f.at(29);
  assert.ok(height(roofs, 4) > .45 && height(corners, 8) > 22, 'the late skyline is fully frozen');
  f.at(14);
  assert.deepEqual(snapshot(f.named('The Day After Tomorrow — superstorm')), before);
});

test('lower storm tiers preserve architectural frost while reducing snow and drifts', () => {
  const f = fixture(), counts = [];
  for (const quality of ['lite', 'balanced', 'high']) {
    f.canvas.dataset.quality = quality; f.at(24);
    assert.equal(f.named('Windward roof frost').count, f.buildings.length);
    assert.equal(f.named('Descending facade ice').count, f.buildings.length * 2);
    counts.push([f.named('Snow drifts').count, f.named('Directional snow front').geometry.drawRange.count]);
  }
  assert.ok(counts[0][0] < counts[1][0] && counts[1][0] < counts[2][0]);
  assert.ok(counts[0][1] < counts[1][1] && counts[1][1] < counts[2][1]);
});

test('storm refinement preserves shared building transforms through timeline and scene switches', () => {
  const f = fixture('balanced'), root = f.named('The Day After Tomorrow — superstorm');
  const buildingsBefore = f.buildings.map(building => ({ position: building.position.toArray(), scale: building.scale.toArray(), color: building.material.color.toArray() }));
  for (const quality of ['lite', 'balanced', 'high']) for (const time of [3, 14, 18, 24, 29]) {
    f.canvas.dataset.quality = quality; f.at(time); const before = snapshot(root);
    f.canvas.dataset.quality = 'high'; f.at(30);
    f.terrestrial.update(10, { id: 'independence-day', ...sceneConfigs['independence-day'] });
    assert.equal(root.visible, false);
    f.canvas.dataset.quality = quality; f.at(time);
    assert.deepEqual(snapshot(root), before, `restore ${quality} time ${time}`);
  }
  assert.deepEqual(f.buildings.map(building => ({ position: building.position.toArray(), scale: building.scale.toArray(), color: building.material.color.toArray() })), buildingsBefore);
});
