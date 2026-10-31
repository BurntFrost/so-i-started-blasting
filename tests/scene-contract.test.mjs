import test from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../dist/scenes.js';
import { sceneConfigs } from '../dist/scene-config.js';

test('every catalogue ID has exactly one rendering configuration, independent of order', () => {
  const ids = scenes.map(scene => scene.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), Object.keys(sceneConfigs).sort());
  for (const scene of [...scenes].reverse()) {
    assert.ok(['original','terrestrial','cosmic'].includes(scene.renderer));
    assert.ok(['city','landscape','space'].includes(scene.world));
    assert.equal(scene.renderer, sceneConfigs[scene.id].renderer);
    assert.equal(Boolean(scene.space), scene.world === 'space');
    assert.equal(scene.camera.length, 3);
    assert.ok(Number.isFinite(scene.environment.fogDensity));
  }
});

test('every catalogue scene supplies a complete finite grade', () => {
  for (const { id, grade } of scenes) {
    assert.equal(grade, sceneConfigs[id].grade, id);
    for (const key of ['exposure','bloomStrength','bloomRadius','bloomThreshold','saturation','grain','aberration']) {
      assert.ok(Number.isFinite(grade[key]) && grade[key] >= 0, `${id}: ${key}`);
    }
    assert.ok(grade.exposure > 0, id);
    assert.equal(grade.tint.length, 3, id);
    assert.ok(grade.tint.every(value => Number.isFinite(value) && value >= 0), id);
    assert.ok(grade.grain <= .05 && grade.aberration <= .01, `${id}: subtle film effects`);
  }
});

test('authored phase boundaries and wide camera limits stay within the player contract', () => {
  for (const scene of scenes) {
    if (scene.phaseTimes) {
      assert.equal(scene.phaseTimes.length, 2, scene.id);
      const [event, aftermath] = scene.phaseTimes;
      assert.ok(Number.isFinite(event) && Number.isFinite(aftermath) && event > 0 && event < aftermath && aftermath < 30, scene.id);
    }
    if (scene.cameraMaxDistance) {
      const distance = Math.hypot(...scene.camera.map((value, i) => value - scene.target[i]));
      assert.ok(Number.isFinite(scene.cameraMaxDistance) && scene.cameraMaxDistance >= distance, `${scene.id}: default camera must not be clamped`);
    }
  }
});
