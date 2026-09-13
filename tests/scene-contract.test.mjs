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
